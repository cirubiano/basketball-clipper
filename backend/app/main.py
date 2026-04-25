from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, clips, video, ws
from app.routers import clubs, seasons, teams, profiles

app = FastAPI(
    title="Basketball Club Management API",
    version="0.2.0",
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

# ── Auth & Profiles ───────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(profiles.router, prefix="/profiles", tags=["profiles"])

# ── Org structure ─────────────────────────────────────────────────────────────
app.include_router(clubs.router, prefix="/clubs", tags=["clubs"])
app.include_router(seasons.router, prefix="/clubs", tags=["seasons"])
app.include_router(teams.router, prefix="/clubs", tags=["teams"])

# ── Video & Clips ─────────────────────────────────────────────────────────────
app.include_router(video.router, prefix="/videos", tags=["videos"])
app.include_router(clips.router, prefix="/clips", tags=["clips"])
app.include_router(ws.router, tags=["websocket"])
