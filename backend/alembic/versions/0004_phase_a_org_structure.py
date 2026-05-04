"""Phase A — organizational structure

Adds:
  - is_admin column to users
  - clubs table
  - seasons table  (with SeasonStatus enum)
  - teams table
  - club_members table
  - profiles table  (with UserRole enum)
  - team_id column to videos (nullable, FK -> teams)

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums ─────────────────────────────────────────────────────────────────
    # Eliminamos los tipos antes de crearlos para manejar migraciones parciales
    # previas. CASCADE es seguro porque las tablas que los usan aun no existen.
    op.execute(sa.text("DROP TYPE IF EXISTS seasonstatus CASCADE"))
    op.execute(sa.text("DROP TYPE IF EXISTS userrole CASCADE"))
    # Los tipos se crean automaticamente cuando SQLAlchemy ejecuta create_table.

    # ── users — add is_admin ───────────────────────────────────────────────────
    # IF NOT EXISTS evita error si la columna ya existe de una ejecucion previa.
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "is_admin BOOLEAN NOT NULL DEFAULT false"
    ))

    # ── clubs ──────────────────────────────────────────────────────────────────
    op.create_table(
        "clubs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── seasons ────────────────────────────────────────────────────────────────
    op.create_table(
        "seasons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "club_id",
            sa.Integer(),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "status",
            sa.Enum("future", "active", "archived", name="seasonstatus"),
            nullable=False,
            server_default="future",
        ),
        sa.Column("starts_at", sa.Date(), nullable=True),
        sa.Column("ends_at", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_seasons_club_id ON seasons (club_id)"
    ))

    # ── teams ──────────────────────────────────────────────────────────────────
    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "club_id",
            sa.Integer(),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "season_id",
            sa.Integer(),
            sa.ForeignKey("seasons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_teams_club_id ON teams (club_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_teams_season_id ON teams (season_id)"
    ))

    # ── club_members ───────────────────────────────────────────────────────────
    op.create_table(
        "club_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "club_id",
            sa.Integer(),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invited_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("club_id", "user_id", name="uq_club_members_club_user"),
    )
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_club_members_user_id ON club_members (user_id)"
    ))

    # ── profiles ───────────────────────────────────────────────────────────────
    op.create_table(
        "profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "club_id",
            sa.Integer(),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "season_id",
            sa.Integer(),
            sa.ForeignKey("seasons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum(
                "technical_director", "head_coach", "staff_member",
                name="userrole",
            ),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_profiles_user_id ON profiles (user_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_profiles_club_id ON profiles (club_id)"
    ))

    # ── videos — add team_id ───────────────────────────────────────────────────
    op.execute(sa.text(
        "ALTER TABLE videos ADD COLUMN IF NOT EXISTS "
        "team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE videos DROP COLUMN IF EXISTS team_id"))
    op.drop_table("profiles")
    op.drop_table("club_members")
    op.drop_table("teams")
    op.drop_table("seasons")
    op.drop_table("clubs")
    op.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS is_admin"))
    op.execute(sa.text("DROP TYPE IF EXISTS userrole"))
    op.execute(sa.text("DROP TYPE IF EXISTS seasonstatus"))
