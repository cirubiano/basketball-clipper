"""match_stat_blocks

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-01 00:00:00.000000

Cambios:
- Añade columna blocks (INTEGER nullable) a match_stats
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("match_stats", sa.Column("blocks", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("match_stats", "blocks")
