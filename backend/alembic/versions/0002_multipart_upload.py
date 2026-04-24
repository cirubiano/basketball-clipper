"""Multipart upload support — añade upload_id, upload_parts y estado 'uploading'

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Añadir 'uploading' al enum. PostgreSQL exige que un nuevo valor de
    # enum esté committeado en una transacción previa antes de poder USARLO
    # (ALTER TABLE ... SET DEFAULT 'uploading', por ejemplo). Como Alembic
    # ejecuta toda la migración en una sola transacción, aquí sólo añadimos
    # el valor y no lo referenciamos desde otro DDL. El default de la columna
    # se mantiene en 'pending' a nivel BD — el modelo SQLAlchemy envía
    # explícitamente 'uploading' en cada INSERT nuevo, así que el
    # server_default nunca se activa en la práctica.
    op.execute("ALTER TYPE videostatus ADD VALUE IF NOT EXISTS 'uploading' BEFORE 'pending'")

    # Columnas para tracking del multipart upload
    op.add_column(
        "videos",
        sa.Column("upload_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "videos",
        sa.Column(
            "upload_parts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("videos", "upload_parts")
    op.drop_column("videos", "upload_id")
    # PostgreSQL no permite eliminar valores de un enum sin recrear el tipo.
    # Dejamos el valor 'uploading' en el enum aunque nadie lo use tras el
    # downgrade — no rompe nada.
