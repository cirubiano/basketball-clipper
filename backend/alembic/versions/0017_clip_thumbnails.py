"""clip_thumbnails

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-02 12:00:00.000000

Cambios:
- Añade columna thumbnail_s3_key (nullable) a la tabla clips
  para almacenar la key S3 del thumbnail JPEG generado por FFmpeg.
"""

import sqlalchemy as sa

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clips",
        sa.Column("thumbnail_s3_key", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clips", "thumbnail_s3_key")
