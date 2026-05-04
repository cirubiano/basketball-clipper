"""dynamic_club_positions

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-01 00:00:00.000000

Cambios:
- Crea tabla club_positions (posiciones dinámicas por club).
- Crea tabla player_positions (M2M jugador ↔ posición).
- Elimina la columna position de players.
  NOTA: el enum playerposition se MANTIENE porque roster_entries.position
  todavía lo usa.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── club_positions ────────────────────────────────────────────────────────
    op.create_table(
        "club_positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "color",
            sa.String(length=20),
            nullable=False,
            server_default="#6366f1",
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── player_positions (M2M) ────────────────────────────────────────────────
    op.create_table(
        "player_positions",
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["position_id"], ["club_positions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("player_id", "position_id"),
    )

    # ── Eliminar players.position ─────────────────────────────────────────────
    # El enum playerposition se mantiene para roster_entries.position.
    op.drop_column("players", "position")


def downgrade() -> None:
    op.add_column(
        "players",
        sa.Column(
            "position",
            sa.Enum(
                "point_guard",
                "shooting_guard",
                "small_forward",
                "power_forward",
                "center",
                name="playerposition",
            ),
            nullable=True,
        ),
    )
    op.drop_table("player_positions")
    op.drop_table("club_positions")
