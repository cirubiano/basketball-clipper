"""rival color + competition format fields

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-03
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # opponent_teams: add color
    op.add_column(
        "opponent_teams",
        sa.Column("color", sa.String(20), nullable=False, server_default="#6366f1"),
    )

    # competitions: add format fields (FIBA defaults)
    op.add_column("competitions", sa.Column("quarters",            sa.Integer(), nullable=False, server_default="4"))
    op.add_column("competitions", sa.Column("minutes_per_quarter", sa.Integer(), nullable=False, server_default="10"))
    op.add_column("competitions", sa.Column("players_on_court",    sa.Integer(), nullable=False, server_default="5"))
    op.add_column("competitions", sa.Column("bench_size",          sa.Integer(), nullable=False, server_default="7"))
    op.add_column("competitions", sa.Column("clock_type",          sa.String(20), nullable=False, server_default="stopped"))


def downgrade() -> None:
    op.drop_column("opponent_teams", "color")
    op.drop_column("competitions", "clock_type")
    op.drop_column("competitions", "bench_size")
    op.drop_column("competitions", "players_on_court")
    op.drop_column("competitions", "minutes_per_quarter")
    op.drop_column("competitions", "quarters")
