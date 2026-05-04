"""Add opponent_player_id to custom_match_stats + metadata fields to team_stat_attributes

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-04

Changes on team_stat_attributes:
  - ADD short_name  varchar(10)  nullable
  - ADD description varchar(300) nullable
  - ADD color       varchar(20)  nullable

Changes on custom_match_stats:
  - DROP old UniqueConstraint uq_custom_match_stat
  - ALTER player_id → nullable
  - ADD opponent_player_id (nullable FK → opponent_players)
  - CREATE partial unique indexes for home and rival
"""
from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── team_stat_attributes: new metadata fields ──────────────────────────────
    op.add_column("team_stat_attributes", sa.Column("short_name", sa.String(10), nullable=True))
    op.add_column("team_stat_attributes", sa.Column("description", sa.String(300), nullable=True))
    op.add_column("team_stat_attributes", sa.Column("color", sa.String(20), nullable=True))

    # ── custom_match_stats: rival player support ───────────────────────────────
    op.drop_constraint("uq_custom_match_stat", "custom_match_stats", type_="unique")
    op.alter_column("custom_match_stats", "player_id", nullable=True)
    op.add_column(
        "custom_match_stats",
        sa.Column(
            "opponent_player_id",
            sa.Integer(),
            sa.ForeignKey("opponent_players.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_cstat_home",
        "custom_match_stats",
        ["match_id", "stat_attribute_id", "player_id"],
        unique=True,
        postgresql_where=sa.text("player_id IS NOT NULL"),
    )
    op.create_index(
        "ix_cstat_rival",
        "custom_match_stats",
        ["match_id", "stat_attribute_id", "opponent_player_id"],
        unique=True,
        postgresql_where=sa.text("opponent_player_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_cstat_rival", "custom_match_stats")
    op.drop_index("ix_cstat_home", "custom_match_stats")
    op.drop_column("custom_match_stats", "opponent_player_id")
    op.alter_column("custom_match_stats", "player_id", nullable=False)
    op.create_unique_constraint(
        "uq_custom_match_stat",
        "custom_match_stats",
        ["match_id", "player_id", "stat_attribute_id"],
    )
    op.drop_column("team_stat_attributes", "color")
    op.drop_column("team_stat_attributes", "description")
    op.drop_column("team_stat_attributes", "short_name")
