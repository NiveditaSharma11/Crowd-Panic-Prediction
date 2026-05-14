import cv2
import os

# List all files in folder
folder = r"C:\Users\hp\Downloads\Crowd Panic"
print("Files in folder:")
for f in os.listdir(folder):
    print(f)

# Try opening video
video_path = r"C:\Users\hp\Downloads\Crowd Panic\7353115-uhd_3840_2160_24fps.mp4"
cap = cv2.VideoCapture(video_path)
print(f"\nVideo opened: {cap.isOpened()}")
print(f"FPS: {cap.get(cv2.CAP_PROP_FPS)}")
print(f"Width: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}")
print(f"Height: {cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
cap.release()