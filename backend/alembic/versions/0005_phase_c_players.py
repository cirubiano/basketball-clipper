"""Phase C — players and roster entries

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-25
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Crear el enum manualmente con IF NOT EXISTS para que sea idempotente.
    # Usamos sa.Text() en las columnas para evitar que SQLAlchemy intente
    # crear el tipo de nuevo a través del evento _on_table_create.
    op.execute(sa.text(
        "DO $$ BEGIN "
        "  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'playerposition') THEN "
        "    CREATE TYPE playerposition AS ENUM ("
        "      'point_guard', 'shooting_guard', 'small_forward',"
        "      'power_forward', 'center'"
        "    ); "
        "  END IF; "
        "END $$"
    ))

    # ── players ──────────────────────────────────────────────────────────────
    op.create_table(
        "players",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("club_id", sa.Integer,
                  sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("date_of_birth", sa.Date),
        sa.Column("position", sa.Text),  # cast a playerposition en runtime
        sa.Column("photo_url", sa.String(512)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    # Cambiar el tipo de la columna a playerposition ahora que la tabla existe
    op.execute(sa.text(
        "ALTER TABLE players ALTER COLUMN position TYPE playerposition "
        "USING position::playerposition"
    ))
    op.create_index("ix_players_club_id", "players", ["club_id"])

    # ── roster_entries ────────────────────────────────────────────────────────
    op.create_table(
        "roster_entries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("player_id", sa.Integer,
                  sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Integer,
                  sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("season_id", sa.Integer,
                  sa.ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jersey_number", sa.Integer),
        sa.Column("position", sa.Text),  # cast a playerposition en runtime
        sa.Column("points_per_game", sa.Numeric(5, 1)),
        sa.Column("rebounds_per_game", sa.Numeric(5, 1)),
        sa.Column("assists_per_game", sa.Numeric(5, 1)),
        sa.Column("minutes_per_game", sa.Numeric(5, 1)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("player_id", "team_id", "season_id",
                            name="uq_roster_player_team_season"),
    )
    op.execute(sa.text(
        "ALTER TABLE roster_entries ALTER COLUMN position TYPE playerposition "
        "USING position::playerposition"
    ))
    op.create_index("ix_roster_entries_team_id", "roster_entries", ["team_id"])
    op.create_index("ix_roster_entries_player_id", "roster_entries", ["player_id"])


def downgrade() -> None:
    op.drop_table("roster_entries")
    op.drop_table("players")
    op.execute(sa.text("DROP TYPE IF EXISTS playerposition"))
