"""phase_g_favorites

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-02 00:00:00.000000

Cambios (Fase G):
- Añade columna is_favorite (BOOLEAN, default false) a drills
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "drills",
        sa.Column(
            "is_favorite",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("drills", "is_favorite")
