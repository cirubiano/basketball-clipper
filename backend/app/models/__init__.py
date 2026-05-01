"""
Re-exports de todos los modelos SQLAlchemy.

Importar este paquete garantiza que Base.metadata conozca todas las
tablas, necesario para Alembic y el worker Celery.
"""
from app.models.catalog import ClubCatalogEntry, catalog_entry_tags
from app.models.clip import Clip
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.club_position import ClubPosition, player_positions
from app.models.club_tag import ClubTag
from app.models.drill import CourtLayoutType, Drill, DrillType, Tag, drill_tags
from app.models.exercise import Exercise
from app.models.match import Match, MatchLocation, MatchPlayer, MatchStat, MatchStatus, MatchVideo, MatchVideoLabel
from app.models.player import Player, PlayerPosition, RosterEntry
from app.models.playbook import TeamPlaybookEntry
from app.models.profile import Profile, UserRole
from app.models.season import Season, SeasonStatus
from app.models.team import Team
from app.models.training import Training, TrainingAttendance, TrainingDrill
from app.models.user import User
from app.models.video import Video, VideoStatus

__all__ = [
    "catalog_entry_tags",
    "ClubCatalogEntry",
    "Clip",
    "Club",
    "ClubMember",
    "ClubPosition",
    "player_positions",
    "ClubTag",
    "CourtLayoutType",
    "Drill",
    "DrillType",
    "drill_tags",
    "Exercise",
    "Match",
    "MatchLocation",
    "MatchPlayer",
    "MatchStat",
    "MatchStatus",
    "MatchVideo",
    "MatchVideoLabel",
    "Player",
    "PlayerPosition",
    "RosterEntry",
    "TeamPlaybookEntry",
    "Profile",
    "UserRole",
    "Season",
    "SeasonStatus",
    "Tag",
    "Team",
    "Training",
    "TrainingAttendance",
    "TrainingDrill",
    "User",
    "Video",
    "VideoStatus",
]
