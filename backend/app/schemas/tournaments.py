from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TournamentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    status: str
    game_slug: str
    game_name: str
    banner_url: str | None
    prize_pool_minor: int
    entry_fee_minor: int
    currency: str
    starts_at: datetime
    registration_deadline: datetime
    capacity: int


class TournamentDetail(TournamentListItem):
    description: str | None
    ends_at: datetime | None
    rules: dict
    faqs: list
    organizer_id: UUID
    spots_remaining: int | None = Field(description="Informational only; registration revalidates server-side")


class TournamentPage(BaseModel):
    items: list[TournamentListItem]
    page: int
    page_size: int
    total: int
    has_next: bool
