import os

# Create folders
os.makedirs("videos/panic", exist_ok=True)
os.makedirs("videos/normal", exist_ok=True)

# Download panic crowd videos from YouTube
panic_videos = [
    "https://www.youtube.com/watch?v=oB1RuGjEzQI",  # crowd stampede
    "https://www.youtube.com/watch?v=vTHDKmHPFz8",  # crowd panic
    "https://www.youtube.com/watch?v=3AqGTEMu7kA",  # crowd rush
    "https://www.youtube.com/watch?v=8Do2f6VNmrE",  # crowd emergency
    "https://www.youtube.com/watch?v=pPaFyBQMs0I",  # stampede footage
]

normal_videos = [
    "https://www.youtube.com/watch?v=V4ItBKQfd6Y",  # normal crowd walking
    "https://www.youtube.com/watch?v=nx0qFMIhbkU",  # normal street crowd
    "https://www.youtube.com/watch?v=Qp6mkB2JGSA",  # normal market crowd
    "https://www.youtube.com/watch?v=2DgsGkFkC3I",  # normal event crowd
    "https://www.youtube.com/watch?v=7353115",       # your video already
]

for i, url in enumerate(panic_videos):
    os.system(f'yt-dlp -o "videos/panic/panic_{i}.mp4" -f "best[ext=mp4][height<=480]" "{url}"')

for i, url in enumerate(normal_videos):
    os.system(f'yt-dlp -o "videos/normal/normal_{i}.mp4" -f "best[ext=mp4][height<=480]" "{url}"')

print("Downloads complete!")