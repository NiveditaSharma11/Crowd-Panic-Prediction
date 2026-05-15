from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import aiofiles
import os
import json
import asyncio
import traceback
from notifier import send_alert, reset_alert_state
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import httpx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

manager = ConnectionManager()

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
os.makedirs(FRONTEND_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR, html=False), name="static")


@app.get("/{full_path:path}")
async def get_index_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("ws/") or full_path.startswith("static/"):
        return HTMLResponse(content="Not Found", status_code=404)
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(
                content=f.read(),
                status_code=200,
                headers={
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    return HTMLResponse(content="<h1>Frontend not found</h1>", status_code=404)

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    return {"status": "success", "filename": file.filename, "path": file_path}

@app.post("/api/stream-url")
async def register_stream_url(request: dict):
    import cv2
    url = request.get("url", "").strip()
    if not url:
        return {"status": "error", "error": "No URL provided"}

    resolved_url = url

    # Resolve YouTube / Twitch via yt-dlp
    is_platform = any(x in url for x in ["youtube.com", "youtu.be", "twitch.tv"])
    if is_platform:
        try:
            import yt_dlp
            ydl_opts = {
                'format': 'best[ext=mp4]/best',
                'quiet': True,
                'no_warnings': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                resolved_url = info.get('url') or info.get('manifest_url') or url
                print(f"[Stream] Resolved: {resolved_url[:80]}...")
            # Don't validate with OpenCV — YouTube URLs expire fast
            return {"status": "ok", "url": resolved_url}
        except Exception as e:
            return {"status": "error", "error": f"Could not resolve stream: {str(e)}"}

    # For RTSP/HTTP — test with OpenCV
    cap = cv2.VideoCapture(resolved_url)
    ok = cap.isOpened()
    cap.release()
    if ok:
        return {"status": "ok", "url": resolved_url}
    else:
        # Still pass it through — some streams need special headers
        return {"status": "ok", "url": resolved_url, "warning": "Could not pre-validate stream"}

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await manager.connect(websocket)
    frame_count = 0
    try:
        data = await websocket.receive_text()
        request = json.loads(data)

        filename = request.get("filename")
        if not filename:
            filename = "7353115-uhd_3840_2160_24fps.mp4"
            file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), filename)
        else:
            # Check if it's a URL (live stream) or a filename
            if filename.startswith("rtsp://") or filename.startswith("http://") or filename.startswith("https://"):
                file_path = filename  # pass URL directly to OpenCV
            else:
                file_path = os.path.join(UPLOAD_DIR, filename)

        is_live_stream = file_path.startswith("rtsp://") or file_path.startswith("http://") or file_path.startswith("https://")

        if not is_live_stream and not os.path.exists(file_path):
            await websocket.send_json({"stats": {"error": f"File not found: {filename}"}})
            await websocket.close(code=1000)
            return

        print(f"[WS] Starting stream: {filename} {'(LIVE)' if is_live_stream else ''}")
        reset_alert_state()  # fresh cooldown for each new stream


        try:
            async with httpx.AsyncClient(timeout=None) as client:

                response = await client.post(
                    "https://YOUR-WORKER-URL.onrender.com/process",
                    json={"video_path": file_path}
                )

                data = response.json()

                for item in data["frames"]:

                    payload = {
                        "annotated": f"data:image/jpeg;base64,{item['annotated']}",
                        "heatmap": f"data:image/jpeg;base64,{item['heatmap']}",
                        "stats": item["stats"]
                    }

                    await websocket.send_json(payload)

                    frame_count += 1

                    asyncio.create_task(send_alert(item["stats"]))

        except Exception as e:
            print(f"[WS] Worker error: {e}")
            traceback.print_exc()

            await websocket.send_json({
                "stats": {
                "error": str(e)
            }
        })

        print(f"[WS] Stream complete: {frame_count} frames")
        await websocket.close(code=1000)

    except WebSocketDisconnect:
        print(f"[WS] Client disconnected after {frame_count} frames")
    except Exception as e:
        print(f"[WS] ERROR: {e}")
        traceback.print_exc()
        try:
            await websocket.send_json({"stats": {"error": str(e)}})
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        manager.disconnect(websocket)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        ws_max_size=50*1024*1024
    )