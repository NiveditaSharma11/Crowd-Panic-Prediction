from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from model_runner import generate_frames
import uvicorn

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VideoRequest(BaseModel):
    video_path: str

@app.post("/process")
async def process_video(req: VideoRequest):

    results = []

    async for ann_b64, heat_b64, stats in generate_frames(req.video_path):

        results.append({
            "annotated": ann_b64,
            "heatmap": heat_b64,
            "stats": stats
        })

        if len(results) >= 5:
            break

    return {"frames": results}

if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", 10000))

    uvicorn.run(
        "worker:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )