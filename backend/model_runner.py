import cv2
import numpy as np
import os
import base64
from ultralytics import YOLO
from collections import deque
import asyncio
from concurrent.futures import ThreadPoolExecutor
import torch

_executor = ThreadPoolExecutor(max_workers=2)
DEVICE = "0" if torch.cuda.is_available() else "cpu"

# ── Paths ──
BASE        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# best.pt is a crowd-specific model with 'head' (0) and 'person' (1) classes
# Head detection is far superior in dense crowds where bodies are occluded
BEST_MODEL  = os.path.join(BASE, "best.pt")
FALLBACK    = os.path.join(BACKEND_DIR, "yolov8s.pt")

def load_model():
    for path, label in [(BEST_MODEL, "best.pt (crowd-specific)"), (FALLBACK, "yolov8s.pt (fallback)")]:
        if os.path.exists(path):
            try:
                print(f"Loading {label}...")
                m = YOLO(path)
                print(f"Loaded {label} — classes: {m.names}")
                return m, m.names
            except Exception as e:
                print(f"Failed to load {path}: {e}")
    # last resort: download yolov8s
    try:
        print("Downloading yolov8s.pt...")
        m = YOLO("yolov8s.pt")
        return m, m.names
    except Exception as e:
        print(f"Could not load any model: {e}")
        return None, {}

model = None
MODEL_NAMES = {}
COUNT_CLASSES = [0]

def ensure_model_loaded():
    global model, MODEL_NAMES, COUNT_CLASSES

    if model is None:
        model, MODEL_NAMES = load_model()

        if model and 'head' in MODEL_NAMES.values():
            COUNT_CLASSES = [0, 1]
            print("Using HEAD + PERSON detections for crowd counting")
        else:
            COUNT_CLASSES = [0]
            print("Using PERSON detections for crowd counting")


# ════════════════════════════════════════════════════════
# SAHI-style Tiled Inference
# Slices frame into overlapping tiles, runs YOLO on each,
# merges results with proper NMS to eliminate duplicates.
# ════════════════════════════════════════════════════════
def tiled_detect(mdl, frame, conf=0.08, iou=0.25):
    h, w = frame.shape[:2]

    scale = 640 / max(h, w)

    new_w = int(w * scale)
    new_h = int(h * scale)

    frame = cv2.resize(frame, (new_w, new_h))

    result = mdl.predict(
        frame,
        conf=conf,
        iou=iou,
        max_det=300,
        imgsz=640,
        verbose=False,
        device=DEVICE,
        classes=COUNT_CLASSES
    )[0]

    if result.boxes is None or len(result.boxes) == 0:
        return []

    boxes = result.boxes.xyxy.cpu().numpy()
    scores = result.boxes.conf.cpu().numpy()

    return [
        (box[0], box[1], box[2], box[3], float(scores[i]))
        for i, box in enumerate(boxes)
    ]

    if not all_boxes:
        return []

    # Merge with NMS across all tiles
    boxes_np  = np.array(all_boxes,  dtype=np.float32)
    scores_np = np.array(all_scores, dtype=np.float32)

    widths  = boxes_np[:,2] - boxes_np[:,0]
    heights = boxes_np[:,3] - boxes_np[:,1]
    rects   = np.stack([boxes_np[:,0], boxes_np[:,1], widths, heights], axis=1).tolist()

    indices = cv2.dnn.NMSBoxes(rects, scores_np.tolist(), score_threshold=conf, nms_threshold=0.35)
    if len(indices) == 0:
        return []

    indices = indices.flatten()
    return [(boxes_np[i][0], boxes_np[i][1], boxes_np[i][2], boxes_np[i][3], scores_np[i]) for i in indices]



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
        return 0.0, 0.0, 0.0, False, None

    flow = cv2.calcOpticalFlowFarneback(
        prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
    )
    magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])

    flow_x_std = float(np.std(flow[..., 0]))
    flow_y_std = float(np.std(flow[..., 1]))
    speed = float(np.mean(magnitude))

    is_cam = (flow_x_std < 1.5 and flow_y_std < 1.5 and speed > 3.0)
    if is_cam:
        return 0.0, 0.0, 0.0, True, flow

    chaos = float(np.var(angle))
    angles_flat = angle.flatten()
    sin_mean = np.mean(np.sin(angles_flat))
    cos_mean = np.mean(np.cos(angles_flat))
    direction_conflict = 1.0 - np.sqrt(sin_mean**2 + cos_mean**2)

    return speed, chaos, direction_conflict, False, flow


# ════════════════════════════════════════════════════════
# Density
# ════════════════════════════════════════════════════════
def get_density_features(detected_boxes, frame_w, frame_h):
    grid_counts = []
    for row in range(3):
        for col in range(3):
            x1 = col * frame_w // 3
            y1 = row * frame_h // 3
            x2 = (col + 1) * frame_w // 3
            y2 = (row + 1) * frame_h // 3
            zone = 0
            for bx1, by1, bx2, by2, *_ in detected_boxes:
                cx = (bx1 + bx2) / 2
                cy = (by1 + by2) / 2
                if x1 < cx < x2 and y1 < cy < y2:
                    zone += 1
            grid_counts.append(zone)

    if not grid_counts:
        return 0, 0.0
    return max(grid_counts), float(np.var(grid_counts))


# ════════════════════════════════════════════════════════
# Panic Score
# ════════════════════════════════════════════════════════
def compute_panic_score(baseline, speed, chaos, conflict, density_var, count):
    if not baseline.is_warmed_up():
        return 0
    if count < 10:
        return 0
    if speed < 0.8:
        return 0

    z_speed   = max(0.0, baseline.z_score(speed, baseline.speeds) - 1.0)
    z_chaos   = max(0.0, baseline.z_score(chaos, baseline.chaos) - 1.0)
    z_density = max(0.0, baseline.z_score(density_var, baseline.densities) - 1.0)
    z_conflict = conflict * 2.0

    raw_score = (
        z_speed   * 0.25 +
        z_chaos   * 0.30 +
        z_conflict * 0.25 +
        z_density * 0.20
    )

    if not hasattr(baseline, "panic_history"):
        baseline.panic_history = deque(maxlen=12)

    baseline.panic_history.append(raw_score > 1.2)
    if sum(baseline.panic_history) < 5:
        raw_score *= 0.3

    return min(100, int((raw_score / 4.0) * 100))


# ════════════════════════════════════════════════════════
# Asynchronous Frame Generator
# ════════════════════════════════════════════════════════
async def generate_frames(input_path):
    ensure_model_loaded()
    is_live = input_path.startswith("rtsp://") or \
              input_path.startswith("http://") or \
              input_path.startswith("https://")

    cap = cv2.VideoCapture(input_path)
    if is_live:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if not cap.isOpened() or w == 0 or h == 0:
        yield None, None, {"error": "Could not open video/stream"}
        return

    prev_gray    = None
    baseline     = AdaptiveBaseline()
    risk_buffer  = deque(maxlen=8)
    count_buffer = deque(maxlen=5)
    frame_count  = 0
    last_detected = []
    # For live: run detection every 2nd frame, reuse last result for skipped frames
    # This doubles FPS while keeping detection boxes always visible
    INFER_EVERY   = 2 if is_live else 3
    # For live: drain stale buffer frames before each read
    DRAIN         = 2 if is_live else 0

    while cap.isOpened():
        # Drain stale buffer frames for live streams
        for _ in range(DRAIN):
            cap.grab()

        ret, frame = cap.read()
        if not ret:
            if is_live:
                await asyncio.sleep(0.3)
                continue
            break

        frame_count += 1
        await asyncio.sleep(0)

        # Resize — upscale small live frames for better detection
        fh, fw = frame.shape[:2]
        if is_live and fw < 1280:
            # Upscale small streams so people appear larger to the model
            scale = 1280 / fw
            frame = cv2.resize(frame, (1280, int(fh * scale)), interpolation=cv2.INTER_LINEAR)
            fh, fw = frame.shape[:2]
        elif not is_live and fw > 1280:
            scale = 1280 / fw
            frame = cv2.resize(frame, (1280, int(fh * scale)))
            fh, fw = frame.shape[:2]

        # Optical flow
        small = cv2.resize(frame, (640, 360))
        gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        speed, chaos, conflict, is_cam, flow = get_optical_flow(prev_gray, gray)
        prev_gray = gray

        # ── Detection every INFER_EVERY frames, reuse last result otherwise ──
        if model and (frame_count % INFER_EVERY == 1):
            loop = asyncio.get_event_loop()
            conf   = 0.04 if is_live else 0.08  # very aggressive for live CCTV
            tile_s = 384  if is_live else 512   # smaller tiles = more detections
            last_detected = await loop.run_in_executor(
                _executor,
                lambda f=frame: tiled_detect(
                    model,
                    f,
                    conf=conf,
                    iou=0.25
                )
            )

        detected  = last_detected
        annotated = frame.copy()
        count     = 0

        for det in detected:
            x1, y1, x2, y2, score = det
            color = (0,255,0) if score > 0.5 else (0,255,255) if score > 0.3 else (255,255,0)
            cv2.rectangle(annotated, (int(x1),int(y1)), (int(x2),int(y2)), color, 2)
            count += 1

        count_buffer.append(count)
        count = int(np.mean(count_buffer))

        fh2, fw2    = annotated.shape[:2]
        frame_area  = (fw2 * fh2) / 10000.0
        density     = round(count / frame_area, 2) if frame_area > 0 else 0.0
        density_label = ("Low" if density < 0.5 else
                         "Moderate" if density < 1.5 else
                         "High" if density < 3.0 else "Critical")

        max_density, density_var = get_density_features(detected, fw2, fh2)
        if not is_cam:
            baseline.update(speed, chaos, density_var, count)

        panic_score = compute_panic_score(baseline, speed, chaos, conflict, density_var, count)
        if density > 3.0:   panic_score = min(100, panic_score + 30)
        elif density > 1.5: panic_score = min(100, panic_score + 10)
        panic_score = min(100, panic_score)
        risk_buffer.append(panic_score)
        smoothed = int(np.mean(risk_buffer))

        cv2.putText(annotated, f"Risk: {smoothed}%", (30, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0,0,255), 4)

        # Heatmap
        if flow is not None:
            magnitude, angle = cv2.cartToPolar(flow[...,0], flow[...,1])
            hsv = np.zeros((*gray.shape, 3), dtype=np.uint8)
            hsv[...,0] = angle * 180 / np.pi / 2
            hsv[...,1] = 255
            hsv[...,2] = cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX)
            heatmap     = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
            heatmap_bg  = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            heatmap_vis = cv2.addWeighted(heatmap_bg, 0.4, heatmap, 0.6, 0)
        else:
            heatmap_vis = np.zeros((*gray.shape, 3), dtype=np.uint8)

        q = 55 if is_live else 70
        _, buf_ann  = cv2.imencode('.jpg', annotated,   [cv2.IMWRITE_JPEG_QUALITY, q])
        _, buf_heat = cv2.imencode('.jpg', heatmap_vis, [cv2.IMWRITE_JPEG_QUALITY, 50])

        yield (base64.b64encode(buf_ann).decode(),
               base64.b64encode(buf_heat).decode(),
               {"danger_level": smoothed, "people_count": count,
                "density": density, "density_label": density_label,
                "speed_index": round(speed, 2), "frame": frame_count})

    cap.release()
    yield None, None, {"status": "finished"}
