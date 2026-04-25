"""
Re-exports de todos los modelos SQLAlchemy.

Importar este paquete garantiza que Base.metadata conozca todas las
tablas, necesario para Alembic y el worker Celery.
"""
from app.models.clip import Clip
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.drill import CourtLayoutType, Drill, DrillType, Tag, drill_tags
from app.models.exercise import Exercise
from app.models.player import Player, PlayerPosition, RosterEntry
from app.models.profile import Profile, UserRole
from app.models.season import Season, SeasonStatus
from app.models.team import Team
from app.models.user import User
from app.models.video import Video, VideoStatus

__all__ = [
    "Clip",
    "Club",
    "ClubMember",
    "CourtLayoutType",
    "Drill",
    "DrillType",
    "drill_tags",
    "Exercise",
    "Player",
    "PlayerPosition",
    "RosterEntry",
    "Profile",
    "UserRole",
    "Season",
    "SeasonStatus",
    "Tag",
    "Team",
    "User",
    "Video",
    "VideoStatus",
]
