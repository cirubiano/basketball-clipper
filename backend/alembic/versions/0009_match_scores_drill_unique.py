"""match_scores_drill_unique

Revision ID: 0009
Revises: 1f6f880ded2f
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "1f6f880ded2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # TAREA 2: add our_score / their_score to matches
    op.add_column("matches", sa.Column("our_score", sa.Integer(), nullable=True))
    op.add_column("matches", sa.Column("their_score", sa.Integer(), nullable=True))

    # TAREA 4: deduplicate first, then add unique constraint
    op.execute(sa.text("""
        DELETE FROM training_drills
        WHERE id NOT IN (
            SELECT MIN(id) FROM training_drills GROUP BY training_id, drill_id
        )
    """))
    op.create_unique_constraint(
        "uq_training_drill", "training_drills", ["training_id", "drill_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_training_drill", "training_drills", type_="unique")
    op.drop_column("matches", "their_score")
    op.drop_column("matches", "our_score")
