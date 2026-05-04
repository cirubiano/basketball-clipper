"""team_stat_attributes and custom_match_stats

Revision ID: 0023
Revises: 0022_match_minutes_tracking
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # team_stat_attributes
    op.create_table(
        "team_stat_attributes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(),
                  sa.ForeignKey("teams.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("type",
                  sa.Enum("count", name="statattributetype"),
                  nullable=False, server_default="count"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # custom_match_stats
    op.create_table(
        "custom_match_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.Integer(),
                  sa.ForeignKey("matches.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("player_id", sa.Integer(),
                  sa.ForeignKey("players.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("stat_attribute_id", sa.Integer(),
                  sa.ForeignKey("team_stat_attributes.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "match_id", "player_id", "stat_attribute_id",
            name="uq_custom_match_stat",
        ),
    )


def downgrade() -> None:
    op.drop_table("custom_match_stats")
    op.drop_table("team_stat_attributes")
    op.execute(sa.text("DROP TYPE statattributetype"))
