"""Phase 0 domain foundation and auth hardening tables."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002_phase0_domain"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS user_role")
    op.add_column("users", sa.Column("role_v2", sa.String(20), nullable=True))
    op.execute("UPDATE users SET role_v2 = role")
    op.execute("ALTER TABLE users DROP COLUMN role")
    op.alter_column("users", "role_v2", new_column_name="role", nullable=False, server_default="user")
    op.create_check_constraint("ck_users_role", "users", "role IN ('user','organizer','admin','super_admin')")

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100)),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True)),
        sa.Column("metadata_json", postgresql.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    op.create_table(
        "games",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text()), sa.Column("logo_url", sa.String(500)),
        sa.Column("banner_url", sa.String(500)), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_games_slug", "games", ["slug"])
    op.create_index("ix_games_is_active", "games", ["is_active"])
    op.create_table(
        "game_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("games.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False), sa.Column("team_size", sa.Integer(), nullable=False),
        sa.Column("substitutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("supported_formats", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("player_metadata_fields", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_game_configurations_game_id", "game_configurations", ["game_id"])

    op.create_table(
        "tournaments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("slug", sa.String(120), unique=True, nullable=False),
        sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("games.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("organizer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("banner_url", sa.String(500)), sa.Column("prize_pool_minor", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entry_fee_minor", sa.Integer(), nullable=False, server_default="0"), sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("registration_deadline", sa.DateTime(timezone=True), nullable=False), sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("rules", sa.JSON(), nullable=False, server_default="{}"), sa.Column("faqs", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('draft','published','live','completed','cancelled')", name="ck_tournaments_status"),
        sa.CheckConstraint("capacity > 0", name="ck_tournaments_capacity_positive"),
    )
    op.create_index("ix_tournaments_slug", "tournaments", ["slug"])
    op.create_index("ix_tournaments_status", "tournaments", ["status"])
    op.create_index("ix_tournaments_game_id", "tournaments", ["game_id"])
    op.create_index("ix_tournaments_organizer_id", "tournaments", ["organizer_id"])
    op.create_index("ix_tournaments_starts_at", "tournaments", ["starts_at"])
    op.create_index("ix_tournaments_discovery", "tournaments", ["status", "starts_at", "game_id"])

    valorant_id = "00000000-0000-0000-0000-000000000001"
    op.execute(sa.text("INSERT INTO games (id, slug, name, description) VALUES (:id, 'valorant', 'VALORANT', 'Riot Games tactical shooter') ON CONFLICT (slug) DO NOTHING").bindparams(id=valorant_id))
    op.execute(sa.text("INSERT INTO game_configurations (id, game_id, name, team_size, substitutes, supported_formats) VALUES (:id, :game_id, 'Competitive 5v5', 5, 2, CAST(:formats AS json))").bindparams(id="00000000-0000-0000-0000-000000000011", game_id=valorant_id, formats='["single_elimination","round_robin"]'))


def downgrade() -> None:
    op.drop_table("tournaments")
    op.drop_table("game_configurations")
    op.drop_table("games")
    op.drop_table("audit_logs")
    op.drop_table("password_reset_tokens")
    op.drop_constraint("ck_users_role", "users", type_="check")
