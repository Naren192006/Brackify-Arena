from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TournamentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    status: str
    computed_status: str | None = None
    is_registration_open: bool = False
    game_slug: str
    game_name: str
    banner_url: str | None
    prize_pool_minor: int
    entry_fee_minor: int
    currency: str
    starts_at: datetime
    registration_deadline: datetime
    capacity: int
    filled_slots: int = 0
    remaining_slots: int = 0


class TournamentDetail(TournamentListItem):
    description: str | None
    ends_at: datetime | None
    rules: dict[str, Any] | None = None
    faqs: list[Any] | None = None
    organizer_id: UUID | None = None
    spots_remaining: int | None = Field(
        default=None, description="Informational only; registration revalidates server-side"
    )


class TournamentPage(BaseModel):
    items: list[TournamentListItem]
    page: int
    page_size: int
    total: int
    has_next: bool
