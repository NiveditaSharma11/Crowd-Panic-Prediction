import cv2
import numpy as np
import os
from ultralytics import YOLO
from collections import deque

# ── Paths ──
BASE   = os.path.dirname(os.path.abspath(__file__))
MODEL  = os.path.join(BASE, "best.pt")
VIDEO  = os.path.join(BASE, "7353115-uhd_3840_2160_24fps.mp4")
OUTPUT = os.path.join(BASE, "output_annotated.mp4")

print("Loading model...")
model = YOLO(MODEL)
print("Model loaded!")

# 🔥 Track memory
person_tracks = {}


# ════════════════════════════════════════════════════════
# Adaptive baseline
# ════════════════════════════════════════════════════════
class AdaptiveBaseline:
    def __init__(self, warmup_frames=60, window=90):
        self.warmup = warmup_frames
        self.window = window
        self.speeds = deque(maxlen=window)
        self.chaos = deque(maxlen=window)
        self.densities = deque(maxlen=window)
        self.counts = deque(maxlen=window)
        self.frame_n = 0

    def update(self, speed, chaos, density, count):
        self.frame_n += 1
        self.speeds.append(speed)
        self.chaos.append(chaos)
        self.densities.append(density)
        self.counts.append(count)

    def is_warmed_up(self):
        return self.frame_n >= self.warmup

    def baseline(self, arr):
        a = np.array(arr)
        return float(np.mean(a)), float(np.std(a) + 1e-6)

    def z_score(self, value, arr):
        mean, std = self.baseline(arr)
        return max(0.0, (value - mean) / std)


# ════════════════════════════════════════════════════════
# Optical Flow
# ════════════════════════════════════════════════════════
def get_optical_flow(prev_gray, gray):
    if prev_gray is None:
        return 0.0, 0.0, 0.0, False

    flow = cv2.calcOpticalFlowFarneback(
        prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
    )
    magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])

    flow_x_std = float(np.std(flow[..., 0]))
    flow_y_std = float(np.std(flow[..., 1]))
    speed = float(np.mean(magnitude))

    is_cam = (flow_x_std < 1.5 and flow_y_std < 1.5 and speed > 3.0)

    if is_cam:
        return 0.0, 0.0, 0.0, True

    chaos = float(np.var(angle))

    angles_flat = angle.flatten()
    sin_mean = np.mean(np.sin(angles_flat))
    cos_mean = np.mean(np.cos(angles_flat))
    direction_conflict = 1.0 - np.sqrt(sin_mean**2 + cos_mean**2)

    return speed, chaos, direction_conflict, False


# ════════════════════════════════════════════════════════
# Density
# ════════════════════════════════════════════════════════
def get_density_features(boxes, frame_w, frame_h):
    grid_counts = []
    for row in range(3):
        for col in range(3):
            x1 = col * frame_w // 3
            y1 = row * frame_h // 3
            x2 = (col+1) * frame_w // 3
            y2 = (row+1) * frame_h // 3

            zone = 0
            for box in boxes.xyxy:
                cx = (box[0] + box[2]) / 2
                cy = (box[1] + box[3]) / 2
                if x1 < cx < x2 and y1 < cy < y2:
                    zone += 1
            grid_counts.append(zone)

    return max(grid_counts), float(np.var(grid_counts))


# ════════════════════════════════════════════════════════
# Panic Score (FIXED)
# ════════════════════════════════════════════════════════
def compute_panic_score(baseline, speed, chaos, conflict, density_var, count):

    if not baseline.is_warmed_up():
        return 0

    if count < 10:
        return 0

    if speed < 0.8:
        return 0

    z_speed    = baseline.z_score(speed, baseline.speeds)
    z_chaos    = baseline.z_score(chaos, baseline.chaos)
    z_density  = baseline.z_score(density_var, baseline.densities)

    z_speed   = max(0.0, z_speed - 1.0)
    z_chaos   = max(0.0, z_chaos - 1.0)
    z_density = max(0.0, z_density - 1.0)

    z_conflict = conflict * 2.0

    raw_score = (
        z_speed    * 0.25 +
        z_chaos    * 0.30 +
        z_conflict * 0.25 +
        z_density  * 0.20
    )

    # temporal consistency
    if not hasattr(baseline, "panic_history"):
        baseline.panic_history = deque(maxlen=12)

    baseline.panic_history.append(raw_score > 1.2)

    if sum(baseline.panic_history) < 5:
        raw_score *= 0.3

    panic_score = min(100, int((raw_score / 4.0) * 100))

    return panic_score


# ════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════
def process_video(input_path, output_path):

    cap = cv2.VideoCapture(input_path)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    out = cv2.VideoWriter(output_path,
                          cv2.VideoWriter_fourcc(*'mp4v'),
                          fps, (w, h))

    prev_gray = None
    baseline = AdaptiveBaseline()
    risk_buffer = deque(maxlen=8)
    count_buffer = deque(maxlen=5)

    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        # skip frames
        if frame_count % 2 != 0:
            out.write(frame)
            continue

        small = cv2.resize(frame, (640, 360))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        speed, chaos, conflict, is_cam = get_optical_flow(prev_gray, gray)
        prev_gray = gray

        # tracking
        track = model.track(
            frame,
            conf=0.5,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False
        )[0]

        annotated = track.plot()

        # count
        count = 0
        running_count = 0
        walking_count = 0

        if track.boxes is not None and track.boxes.id is not None:
            ids = track.boxes.id.cpu().numpy().astype(int)
            boxes = track.boxes.xyxy.cpu().numpy()
            classes = track.boxes.cls.cpu().numpy()

            valid_ids = []

            for i, track_id in enumerate(ids):

                if int(classes[i]) != 0:
                    continue

                x1, y1, x2, y2 = boxes[i]
                area = (x2 - x1) * (y2 - y1)

                if area < 800:
                    continue

                valid_ids.append(track_id)

                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2

                if track_id not in person_tracks:
                    person_tracks[track_id] = []

                person_tracks[track_id].append((cx, cy))

                if len(person_tracks[track_id]) > 5:
                    person_tracks[track_id].pop(0)

                if len(person_tracks[track_id]) >= 2:
                    px, py = person_tracks[track_id][-2]
                    move = np.sqrt((cx - px)**2 + (cy - py)**2)

                    if move > 15:
                        running_count += 1
                    elif move > 5:
                        walking_count += 1

            count = len(set(valid_ids))

        # smooth count
        count_buffer.append(count)
        count = int(np.mean(count_buffer))

        # density
        if track.boxes is not None:
            max_density, density_var = get_density_features(track.boxes, w, h)
        else:
            max_density, density_var = 0, 0

        if not is_cam:
            baseline.update(speed, chaos, density_var, count)

        # panic score
        panic_score = compute_panic_score(
            baseline, speed, chaos, conflict, density_var, count
        )

        # running boost
        if count > 0:
            run_ratio = running_count / count

            if run_ratio > 0.5:
                panic_score += 40
            elif run_ratio > 0.3:
                panic_score += 20

        panic_score = min(100, panic_score)

        risk_buffer.append(panic_score)
        smoothed = int(np.mean(risk_buffer))

        # display
        cv2.putText(annotated,
                    f"People: {count} | Risk: {smoothed}%",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1, (0,255,0), 2)

        cv2.putText(annotated,
                    f"Running: {running_count}  Walking: {walking_count}",
                    (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, (0,255,255), 2)

        out.write(annotated)

        if frame_count % 60 == 0:
            print(f"Frame {frame_count} | People: {count} | Risk: {smoothed}%")

    cap.release()
    out.release()
    print("Done!")


process_video(VIDEO, OUTPUT)