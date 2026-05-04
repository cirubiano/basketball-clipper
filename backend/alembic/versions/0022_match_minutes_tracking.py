"""match minutes tracking — track_home/rival_minutes, is_starter

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-03
"""
import sqlalchemy as sa

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # matches — two tracking flags
    op.add_column("matches", sa.Column(
        "track_home_minutes", sa.Boolean(), nullable=False, server_default="true"
    ))
    op.add_column("matches", sa.Column(
        "track_rival_minutes", sa.Boolean(), nullable=False, server_default="false"
    ))
    # match_players — is_starter flag
    op.add_column("match_players", sa.Column(
        "is_starter", sa.Boolean(), nullable=False, server_default="false"
    ))
    # opponent_match_stats — is_starter flag
    op.add_column("opponent_match_stats", sa.Column(
        "is_starter", sa.Boolean(), nullable=False, server_default="false"
    ))


def downgrade() -> None:
    op.drop_column("opponent_match_stats", "is_starter")
    op.drop_column("match_players", "is_starter")
    op.drop_column("matches", "track_rival_minutes")
    op.drop_column("matches", "track_home_minutes")
