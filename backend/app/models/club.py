from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(512))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships (lazy loaded — no circular imports)
    seasons: Mapped[list["Season"]] = relationship(  # noqa: F821
        "Season", back_populates="club", lazy="select"
    )
    teams: Mapped[list["Team"]] = relationship(  # noqa: F821
        "Team", back_populates="club", lazy="select"
    )
    members: Mapped[list["ClubMember"]] = relationship(  # noqa: F821
        "ClubMember", back_populates="club", lazy="select"
    )
    profiles: Mapped[list["Profile"]] = relationship(  # noqa: F821
        "Profile", back_populates="club", lazy="select"
    )
    players: Mapped[list["Player"]] = relationship(  # noqa: F821
        "Player", back_populates="club", lazy="select"
    )
