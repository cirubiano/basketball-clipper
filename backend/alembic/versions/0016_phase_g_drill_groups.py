"""phase_g_drill_groups

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-02 00:02:00.000000

Cambios (Fase G):
- Crea tabla training_drill_groups (RF-520)
- Crea tabla training_drill_group_players (M2M grupos ↔ jugadores)
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "training_drill_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_drill_id", sa.Integer(), nullable=False),
        sa.Column("group_number", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["training_drill_id"],
            ["training_drills.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "training_drill_group_players",
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["training_drill_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "player_id"),
    )


def downgrade() -> None:
    op.drop_table("training_drill_group_players")
    op.drop_table("training_drill_groups")
