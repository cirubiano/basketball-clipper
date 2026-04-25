import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    technical_director = "technical_director"
    head_coach = "head_coach"
    staff_member = "staff_member"


class Profile(Base):
    """
    Asignación específica de un usuario a un club en un rol concreto.
    Granularidad: (user, club, team?, role, season).

    - TechnicalDirector opera a nivel de club → team_id = NULL.
    - HeadCoach y StaffMember operan a nivel de equipo → team_id NOT NULL.

    El id de este objeto es el claim `profile_id` que viaja en el JWT
    cuando el usuario selecciona este perfil activo.
    """
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    # NULL para TechnicalDirector (opera a nivel de club, no de equipo)
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE")
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="userrole"), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="profiles")  # noqa: F821
    club: Mapped["Club"] = relationship("Club", back_populates="profiles")  # noqa: F821
    team: Mapped["Team | None"] = relationship("Team", back_populates="profiles")  # noqa: F821
    season: Mapped["Season"] = relationship("Season", back_populates="profiles")  # noqa: F821
