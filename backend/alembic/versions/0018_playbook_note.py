"""playbook_note

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-02 12:30:00.000000

Cambios:
- Añade columna note (Text, nullable) a team_playbook_entries
  para que los coaches añadan anotaciones tácticas a cada jugada.
"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "team_playbook_entries",
        sa.Column("note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("team_playbook_entries", "note")
