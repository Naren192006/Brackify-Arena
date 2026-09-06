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
    __table_args__ = (Index("ix_tournaments_discovery", "status", "starts_at", "game_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TournamentStatus] = mapped_column(
        Enum(TournamentStatus, native_enum=False), default=TournamentStatus.DRAFT, index=True, nullable=False
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    organizer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    banner_url: Mapped[str | None] = mapped_column(String(500))
    prize_pool_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entry_fee_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    rules: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    faqs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    game: Mapped[Game] = relationship()
    organizer: Mapped[User] = relationship()
