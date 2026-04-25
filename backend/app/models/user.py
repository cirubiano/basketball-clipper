from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    profiles: Mapped[list["Profile"]] = relationship(  # noqa: F821
        "Profile", back_populates="user", lazy="select"
    )
    club_memberships: Mapped[list["ClubMember"]] = relationship(  # noqa: F821
        "ClubMember", foreign_keys="ClubMember.user_id", back_populates="user", lazy="select"
    )
    drills: Mapped[list["Drill"]] = relationship(  # noqa: F821
        "Drill", back_populates="user", lazy="select"
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        "Tag", back_populates="user", lazy="select"
    )
