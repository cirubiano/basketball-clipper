"""phase_h_competitions_rivals

Revision ID: 0019
Revises: 0016
Create Date: 2026-05-02 00:03:00.000000

Cambios (Fase H — Competiciones y Rivales):
- Crea tabla competitions (RF-600)
- Crea tabla opponent_teams (RF-620)
- Crea tabla opponent_players (RF-622)
- Crea tabla opponent_match_stats (RF-626)
- Añade competition_id (FK nullable) a matches (RF-604)
- Añade opponent_id (FK nullable) a matches (RF-624)
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── competitions ─────────────────────────────────────────────────────────
    op.create_table(
        "competitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("season_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["season_id"], ["seasons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_competitions_team_season", "competitions", ["team_id", "season_id"])

    # ── opponent_teams ────────────────────────────────────────────────────────
    op.create_table(
        "opponent_teams",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_opponent_teams_club", "opponent_teams", ["club_id"])

    # ── opponent_players ──────────────────────────────────────────────────────
    op.create_table(
        "opponent_players",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("opponent_team_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("jersey_number", sa.Integer(), nullable=True),
        sa.Column("position", sa.String(50), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["opponent_team_id"], ["opponent_teams.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_opponent_players_team", "opponent_players", ["opponent_team_id"]
    )

    # ── opponent_match_stats ──────────────────────────────────────────────────
    op.create_table(
        "opponent_match_stats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("opponent_player_id", sa.Integer(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("assists", sa.Integer(), nullable=True),
        sa.Column("defensive_rebounds", sa.Integer(), nullable=True),
        sa.Column("offensive_rebounds", sa.Integer(), nullable=True),
        sa.Column("steals", sa.Integer(), nullable=True),
        sa.Column("turnovers", sa.Integer(), nullable=True),
        sa.Column("fouls", sa.Integer(), nullable=True),
        sa.Column("blocks", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["opponent_player_id"], ["opponent_players.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "match_id", "opponent_player_id", name="uq_opponent_match_stat"
        ),
    )

    # ── FK columns on matches ─────────────────────────────────────────────────
    op.add_column(
        "matches",
        sa.Column("competition_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_matches_competition",
        "matches",
        "competitions",
        ["competition_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "matches",
        sa.Column("opponent_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_matches_opponent_team",
        "matches",
        "opponent_teams",
        ["opponent_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_matches_opponent_team", "matches", type_="foreignkey")
    op.drop_column("matches", "opponent_id")
    op.drop_constraint("fk_matches_competition", "matches", type_="foreignkey")
    op.drop_column("matches", "competition_id")

    op.drop_table("opponent_match_stats")
    op.drop_index("ix_opponent_players_team", table_name="opponent_players")
    op.drop_table("opponent_players")
    op.drop_index("ix_opponent_teams_club", table_name="opponent_teams")
    op.drop_table("opponent_teams")
    op.drop_index("ix_competitions_team_season", table_name="competitions")
    op.drop_table("competitions")
