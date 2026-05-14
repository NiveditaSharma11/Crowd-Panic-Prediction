import cv2
import numpy as np
import os
import pandas as pd
from ultralytics import YOLO

model = YOLO("best.pt")

def extract_video_features(video_path):
    cap = cv2.VideoCapture(video_path)
    prev_gray = None
    frame_features = []
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if frame_count % 5 != 0:  # every 5th frame
            continue

        # Resize for speed
        frame = cv2.resize(frame, (640, 360))

        # YOLO detection
        results = model(frame, conf=0.25, verbose=False)[0]
        boxes = results.boxes
        person_count = len(boxes)

        # Grid density
        h, w = frame.shape[:2]
        grid_counts = []
        for row in range(3):
            for col in range(3):
                x1 = col * w // 3
                y1 = row * h // 3
                x2 = (col+1) * w // 3
                y2 = (row+1) * h // 3
                zone_count = 0
                for box in boxes.xyxy:
                    cx = (box[0] + box[2]) / 2
                    cy = (box[1] + box[3]) / 2
                    if x1 < cx < x2 and y1 < cy < y2:
                        zone_count += 1
                grid_counts.append(zone_count)

        max_density = max(grid_counts) if grid_counts else 0
        density_var = float(np.var(grid_counts))

        # Optical flow
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        flow_speed, flow_var, flow_chaos = 0, 0, 0

        if prev_gray is not None:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, gray, None,
                0.5, 3, 15, 3, 5, 1.2, 0
            )
            magnitude, angle = cv2.cartToPolar(
                flow[..., 0], flow[..., 1]
            )
            flow_speed = float(np.mean(magnitude))
            flow_var   = float(np.var(magnitude))
            flow_chaos = float(np.var(angle))  # directional chaos

        prev_gray = gray

        frame_features.append([
            person_count,
            max_density,
            density_var,
            flow_speed,
            flow_var,
            flow_chaos
        ])

    cap.release()

    if not frame_features:
        return None

    # Summarize whole video into one feature vector
    arr = np.array(frame_features)
    return [
        np.mean(arr[:, 0]),   # avg person count
        np.max(arr[:, 1]),    # peak density
        np.mean(arr[:, 2]),   # avg density variance
        np.mean(arr[:, 3]),   # avg flow speed
        np.max(arr[:, 3]),    # peak flow speed
        np.mean(arr[:, 4]),   # avg flow variance
        np.mean(arr[:, 5]),   # avg directional chaos
        np.max(arr[:, 5]),    # peak directional chaos
        np.std(arr[:, 0]),    # person count fluctuation
        np.std(arr[:, 3]),    # speed fluctuation
    ]


# ── Extract from all videos ──
X, y = [], []

print("Extracting features from PANIC videos...")
for f in os.listdir("videos/panic"):
    if f.endswith(".mp4"):
        path = os.path.join("videos/panic", f)
        print(f"  Processing {f}...")
        features = extract_video_features(path)
        if features:
            X.append(features)
            y.append(1)  # panic

print("Extracting features from NORMAL videos...")
for f in os.listdir("videos/normal"):
    if f.endswith(".mp4"):
        path = os.path.join("videos/normal", f)
        print(f"  Processing {f}...")
        features = extract_video_feature(path)
        if features:
            X.append(features)
            y.append(0)  # normal

# Save dataset
df = pd.DataFrame(X, columns=[
    'avg_count', 'peak_density', 'density_var',
    'avg_speed', 'peak_speed', 'speed_var',
    'avg_chaos', 'peak_chaos', 'count_std', 'speed_std'
])
df['label'] = y

df.to_csv("real_features.csv", index=False)
print(f"\nDone! Extracted features from {len(y)} videos")
print(f"Panic videos: {sum(y)}")
print(f"Normal videos: {len(y) - sum(y)}")