"""Initial schema — Phase 1 (users, videos, clips)

Revision ID: 0001
Revises:
Create Date: 2026-04-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    # Supports fast login lookups by email
    op.create_index("ix_users_email", "users", ["email"])

    # ── videostatus enum ───────────────────────────────────────────────────
    # Create the PostgreSQL ENUM type before the table that uses it.
    # The Enum is defined here (create_type=True is the default) so that
    # the downgrade can drop it explicitly after dropping the table.
    videostatus_type = sa.Enum(
        "pending",
        "validating",
        "processing",
        "completed",
        "invalid",
        "error",
        name="videostatus",
    )
    videostatus_type.create(op.get_bind(), checkfirst=True)

    # ── videos ────────────────────────────────────────────────────────────
    op.create_table(
        "videos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("s3_key", sa.String(512), nullable=False),
        sa.Column(
            "status",
            # create_type=False because the type was created above
            sa.Enum(
                "pending",
                "validating",
                "processing",
                "completed",
                "invalid",
                "error",
                name="videostatus",
                create_type=False,
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_videos_user_id", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Supports listing all videos for a given user
    op.create_index("ix_videos_user_id", "videos", ["user_id"])

    # ── clips ─────────────────────────────────────────────────────────────
    op.create_table(
        "clips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("video_id", sa.Integer(), nullable=False),
        # Seconds from the start of the source video
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        # Colour-based team label from the detector ("team_a" / "team_b")
        sa.Column("team", sa.String(50), nullable=True),
        sa.Column("s3_key", sa.String(512), nullable=False),
        # Stored redundantly (= end_time - start_time) for fast ORDER BY / WHERE
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["video_id"],
            ["videos.id"],
            name="fk_clips_video_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Supports listing all clips for a given video
    op.create_index("ix_clips_video_id", "clips", ["video_id"])


def downgrade() -> None:
    op.drop_index("ix_clips_video_id", table_name="clips")
    op.drop_table("clips")

    op.drop_index("ix_videos_user_id", table_name="videos")
    op.drop_table("videos")

    # Drop the ENUM type after the table that uses it is gone
    sa.Enum(name="videostatus").drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
