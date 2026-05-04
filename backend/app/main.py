from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (
    auth,
    catalog,
    clips,
    clubs,
    competitions,
    drills,
    matches,
    opponents,
    playbook,
    players,
    positions,
    profiles,
    seasons,
    stat_attributes,
    teams,
    trainings,
    video,
    ws,
)

app = FastAPI(
    title="Basketball Club Management API",
    version="0.4.0",
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


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok"}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(profiles.router, prefix="/profiles", tags=["profiles"])

app.include_router(clubs.router, prefix="/clubs", tags=["clubs"])
app.include_router(seasons.router, prefix="/clubs", tags=["seasons"])
app.include_router(teams.router, prefix="/clubs", tags=["teams"])
app.include_router(players.router, prefix="/clubs", tags=["players"])
app.include_router(positions.router, prefix="/clubs", tags=["positions"])

app.include_router(video.router, prefix="/videos", tags=["videos"])
app.include_router(clips.router, prefix="/clips", tags=["clips"])
app.include_router(ws.router, tags=["websocket"])

app.include_router(drills.router, prefix="/drills", tags=["drills"])

app.include_router(catalog.router, prefix="/clubs", tags=["catalog"])
app.include_router(playbook.router, prefix="/clubs", tags=["playbook"])

app.include_router(matches.router, prefix="/clubs", tags=["matches"])
app.include_router(trainings.router, prefix="/clubs", tags=["trainings"])

# Phase H
app.include_router(competitions.router, prefix="/clubs", tags=["competitions"])
app.include_router(opponents.router, prefix="/clubs", tags=["opponents"])

# Phase I
app.include_router(stat_attributes.router, prefix="/clubs", tags=["stat_attributes"])
