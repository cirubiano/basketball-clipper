"""phase_e_catalog_playbook

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-26

Fase E — Catálogo del club + TeamPlaybook.

Cambios:
  - Añade columnas is_catalog_copy, is_team_owned, owned_team_id a drills.
  - Crea tabla club_tags.
  - Crea tabla club_catalog_entries + catalog_entry_tags (M2M).
  - Crea tabla team_playbook_entries.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── drills: nuevas columnas para copias especiales ─────────────────────────
    op.add_column("drills", sa.Column(
        "is_catalog_copy", sa.Boolean(), nullable=False, server_default="false"
    ))
    op.add_column("drills", sa.Column(
        "is_team_owned", sa.Boolean(), nullable=False, server_default="false"
    ))
    op.add_column("drills", sa.Column(
        "owned_team_id",
        sa.Integer(),
        sa.ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index("ix_drills_owned_team_id", "drills", ["owned_team_id"])

    # ── club_tags ──────────────────────────────────────────────────────────────
    op.create_table(
        "club_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_club_tags_club_id", "club_tags", ["club_id"])

    # ── club_catalog_entries ───────────────────────────────────────────────────
    op.create_table(
        "club_catalog_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id"), nullable=False),
        sa.Column("drill_id", sa.Integer(), sa.ForeignKey("drills.id"), nullable=False),
        sa.Column(
            "original_drill_id",
            sa.Integer(),
            sa.ForeignKey("drills.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("published_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_club_catalog_entries_club_id", "club_catalog_entries", ["club_id"])
    op.create_index("ix_club_catalog_entries_published_by", "club_catalog_entries", ["published_by"])

    # ── catalog_entry_tags (M2M) ───────────────────────────────────────────────
    op.create_table(
        "catalog_entry_tags",
        sa.Column(
            "entry_id",
            sa.Integer(),
            sa.ForeignKey("club_catalog_entries.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.Integer(),
            sa.ForeignKey("club_tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # ── team_playbook_entries ──────────────────────────────────────────────────
    op.create_table(
        "team_playbook_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("drill_id", sa.Integer(), sa.ForeignKey("drills.id"), nullable=False),
        sa.Column("added_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_frozen", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_team_playbook_entries_team_id", "team_playbook_entries", ["team_id"])
    op.create_index("ix_team_playbook_entries_added_by", "team_playbook_entries", ["added_by"])


def downgrade() -> None:
    op.drop_table("team_playbook_entries")
    op.drop_table("catalog_entry_tags")
    op.drop_table("club_catalog_entries")
    op.drop_table("club_tags")
    op.drop_index("ix_drills_owned_team_id", table_name="drills")
    op.drop_column("drills", "owned_team_id")
    op.drop_column("drills", "is_team_owned")
    op.drop_column("drills", "is_catalog_copy")
