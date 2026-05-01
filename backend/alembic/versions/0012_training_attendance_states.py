"""training_attendance_states

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-01 00:00:00.000000

Cambios:
- Crea enum absencereason (injury, personal, sanction, other)
- Añade is_late (bool) a training_attendances
- Añade absence_reason (enum nullable) a training_attendances
- Añade notes (text nullable) a training_attendances
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CREATE TYPE es DDL transaccional en PostgreSQL — no necesita autocommit_block
    op.execute(
        "CREATE TYPE absencereason AS ENUM ('injury', 'personal', 'sanction', 'other')"
    )
    op.add_column(
        "training_attendances",
        sa.Column("is_late", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "training_attendances",
        sa.Column(
            "absence_reason",
            sa.Enum("injury", "personal", "sanction", "other", name="absencereason"),
            nullable=True,
        ),
    )
    op.add_column(
        "training_attendances",
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("training_attendances", "notes")
    op.drop_column("training_attendances", "absence_reason")
    op.drop_column("training_attendances", "is_late")
    op.execute("DROP TYPE absencereason")
