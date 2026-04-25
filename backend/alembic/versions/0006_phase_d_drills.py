"""phase_d_drills

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-25

Crea las tablas: tags, drills, drill_tags.
Los enums drilltype y courtlayouttype se crean de forma idempotente.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enums (idempotente)
    op.execute(sa.text(
        "DO $$ BEGIN "
        "  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'drilltype') THEN "
        "    CREATE TYPE drilltype AS ENUM ('drill', 'play'); "
        "  END IF; "
        "END $$"
    ))
    op.execute(sa.text(
        "DO $$ BEGIN "
        "  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'courtlayouttype') THEN "
        "    CREATE TYPE courtlayouttype AS ENUM "
        "      ('full_fiba', 'half_fiba', 'mini_fiba', 'half_mini_fiba'); "
        "  END IF; "
        "END $$"
    ))

    # tags
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
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
    op.create_index("ix_tags_user_id", "tags", ["user_id"])

    # drills
    op.create_table(
        "drills",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("court_layout", sa.Text(), nullable=False, server_default="half_fiba"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("root_sequence", sa.JSON(), nullable=False),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("drills.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
    op.create_index("ix_drills_user_id", "drills", ["user_id"])
    op.create_index("ix_drills_parent_id", "drills", ["parent_id"])

    # Cambiar columnas Text a los enums reales.
    # Hay que dropear el server_default de court_layout antes del cast
    # porque PostgreSQL no puede castear un string default al enum automaticamente.
    op.execute(sa.text(
        "ALTER TABLE drills ALTER COLUMN court_layout DROP DEFAULT"
    ))
    op.execute(sa.text(
        "ALTER TABLE drills"
        "  ALTER COLUMN type TYPE drilltype USING type::drilltype,"
        "  ALTER COLUMN court_layout TYPE courtlayouttype USING court_layout::courtlayouttype"
    ))
    op.execute(sa.text(
        "ALTER TABLE drills ALTER COLUMN court_layout SET DEFAULT 'half_fiba'::courtlayouttype"
    ))

    # drill_tags
    op.create_table(
        "drill_tags",
        sa.Column(
            "drill_id",
            sa.Integer(),
            sa.ForeignKey("drills.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.Integer(),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("drill_tags")
    op.drop_table("drills")
    op.drop_table("tags")
    op.execute(sa.text("DROP TYPE IF EXISTS drilltype"))
    op.execute(sa.text("DROP TYPE IF EXISTS courtlayouttype"))
