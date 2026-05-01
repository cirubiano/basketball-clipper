"""match_status_transitions

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-01 00:00:00.000000

Cambios:
- Añade 'in_progress' y 'finished' al enum matchstatus.
- Migra todos los registros 'played' → 'finished'.
- 'played' permanece en el enum de PostgreSQL por compatibilidad
  pero se elimina del modelo Python.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Los nuevos valores de enum deben ser committed antes de usarlos en DML.
    # autocommit_block emite un COMMIT implícito antes de salir del bloque.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE matchstatus ADD VALUE IF NOT EXISTS 'in_progress'")
        op.execute("ALTER TYPE matchstatus ADD VALUE IF NOT EXISTS 'finished'")

    # Migrar 'played' → 'finished' (datos existentes)
    op.execute("UPDATE matches SET status = 'finished' WHERE status = 'played'")


def downgrade() -> None:
    # No se puede eliminar valores de enum en PostgreSQL; revertimos los datos.
    op.execute("UPDATE matches SET status = 'played' WHERE status = 'finished'")
