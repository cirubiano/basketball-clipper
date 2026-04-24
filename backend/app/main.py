from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, clips, video, ws

app = FastAPI(
    title="Basketball Clipper API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(video.router, prefix="/videos", tags=["videos"])
app.include_router(clips.router, prefix="/clips", tags=["clips"])
# WebSocket router registered without a prefix so the path is /ws/{video_id}
app.include_router(ws.router, tags=["websocket"])


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok"}
