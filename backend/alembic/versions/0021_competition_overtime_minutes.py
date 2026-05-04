"""competition: add overtime_minutes field

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-03
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column("overtime_minutes", sa.Integer(), nullable=False, server_default="5"),
    )


def downgrade() -> None:
    op.drop_column("competitions", "overtime_minutes")
