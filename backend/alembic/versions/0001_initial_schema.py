"""Initial schema — Phase 1 (users, videos, clips)

Revision ID: 0001
Revises:
Create Date: 2026-04-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Valores del enum, definidos una sola vez para no duplicarlos
_VIDEO_STATUS_VALUES = (
    "pending",
    "validating",
    "processing",
    "completed",
    "invalid",
    "error",
)


def _videostatus_column_type() -> postgresql.ENUM:
    """
    Tipo ENUM para la columna `videos.status`.

    Se usa `postgresql.ENUM` (dialecto específico) en vez de `sa.Enum`
    porque respeta fielmente `create_type=False`, evitando que SQLAlchemy
    intente emitir otro `CREATE TYPE videostatus` al crear la tabla
    (comportamiento que en `sa.Enum` se ignora en ciertos caminos y
    provocaba `DuplicateObjectError` cuando el tipo ya existía).
    """
    return postgresql.ENUM(
        *_VIDEO_STATUS_VALUES,
        name="videostatus",
        create_type=False,
    )


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

    # ── videostatus enum (idempotent) ─────────────────────────────────────
    # PostgreSQL no soporta `CREATE TYPE IF NOT EXISTS` directamente.
    # Usamos un bloque anónimo DO/EXCEPTION para que la migración sea
    # re-ejecutable sobre una BD donde el tipo ya exista (por ejemplo
    # después de un intento fallido anterior que dejó el tipo creado
    # pero no la tabla `videos`).
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE videostatus AS ENUM (
                'pending', 'validating', 'processing',
                'completed', 'invalid', 'error'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # ── videos ────────────────────────────────────────────────────────────
    op.create_table(
        "videos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("s3_key", sa.String(512), nullable=False),
        sa.Column(
            "status",
            _videostatus_column_type(),
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

    # Drop idempotente del tipo para no romper si la tabla ya no lo usa
    op.execute("DROP TYPE IF EXISTS videostatus")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
