from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from model_runner import generate_frames
import uvicorn
import tempfile
import shutil
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/process")
async def process_video(file: UploadFile = File(...)):

    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, file.filename)

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    results = []

    try:
        async for ann_b64, heat_b64, stats in generate_frames(temp_path):

            results.append({
                "annotated": ann_b64,
                "heatmap": heat_b64,
                "stats": stats
            })

            if len(results) >= 5:
                break

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)

    return {"frames": results}

@app.get("/")
async def root():
    return {"status": "worker running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))

    uvicorn.run(
        "worker:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )