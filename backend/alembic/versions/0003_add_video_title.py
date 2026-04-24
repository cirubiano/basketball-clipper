"""Añade videos.title — etiqueta legible por el usuario

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable para no romper filas existentes (vídeos subidos antes de esta
    # migración no tienen título). En aplicación nuevos vídeos siempre lo
    # traen porque el endpoint init-upload lo exige.
    op.add_column(
        "videos",
        sa.Column("title", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("videos", "title")
