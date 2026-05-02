"""phase_g_training_duration

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-02 00:01:00.000000

Cambios (Fase G):
- Añade columna duration_minutes (INTEGER nullable) a training_drills
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "training_drills",
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("training_drills", "duration_minutes")
