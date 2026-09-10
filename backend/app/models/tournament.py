import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, uuid_pk
from app.models.game import Game
from app.models.user import User


class TournamentStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    LIVE = "live"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Tournament(Base, TimestampMixin):
    __tablename__ = "tournaments"
    __table_args__ = (
        Index("ix_tournaments_discovery", "status", "starts_at", "game_id"),
        Index("ix_tournaments_status_start", "status", "start_time"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TournamentStatus] = mapped_column(
        Enum(TournamentStatus, native_enum=False), default=TournamentStatus.DRAFT, index=True, nullable=False
    )
    game_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    organizer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    banner_url: Mapped[str | None] = mapped_column(String(500))
    prize_pool_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entry_fee_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entry_fee_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_close_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_teams: Mapped[int] = mapped_column(Integer, nullable=False, default=16)
    team_size: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    platform: Mapped[str] = mapped_column(String(50), nullable=False, default="PC")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")
    format: Mapped[str] = mapped_column(String(50), nullable=False, default="single_elimination")
    rules: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=dict)
    faqs: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    # Lifecycle Timestamps
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    game: Mapped[Game | None] = relationship()
    organizer: Mapped[User | None] = relationship()
