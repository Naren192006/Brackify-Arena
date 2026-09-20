"""Brackify Arena — Admin Tournament Schemas and Validation Models.

Strict validation for creation, update, lifecycle transitions, and administration.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


class AdminCreateTournamentRequest(BaseModel):
    title: str = Field(min_length=3, max_length=120, description="Tournament title")
    slug: str | None = Field(default=None, description="Custom slug or auto-generated if omitted")
    game: str = Field(default="VALORANT", max_length=50)
    platform: str = Field(default="PC", max_length=50)
    team_size: int = Field(default=5, ge=1, le=10, description="Players per team")
    max_teams: int = Field(default=16, ge=2, le=512, description="Maximum teams capacity")
    entry_fee: float = Field(default=0.0, ge=0.0, description="Entry fee in INR (0 for free)")
    entry_fee_currency: str = Field(default="INR", max_length=3)
    registration_open_at: datetime
    registration_close_at: datetime
    start_time: datetime
    timezone: str = Field(default="UTC", max_length=50)
    format: str = Field(
        default="single_elimination",
        pattern="^(single_elimination|double_elimination|round_robin)$",
    )
    description: str | None = Field(default=None, max_length=5000)
    rules: str | None = Field(default=None, max_length=10000)
    banner_url: str | None = Field(default=None, max_length=1000)
    status: str = Field(default="draft", pattern="^(draft|published)$")

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 3:
            raise ValueError("Tournament title must be at least 3 characters.")
        return s

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        s = v.strip().lower()
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", s):
            raise ValueError(
                "Slug must contain only lowercase alphanumeric characters and hyphens."
            )
        return s

    @model_validator(mode="after")
    def validate_dates_and_capacity(self) -> AdminCreateTournamentRequest:
        open_at = _ensure_utc(self.registration_open_at)
        close_at = _ensure_utc(self.registration_close_at)
        start_at = _ensure_utc(self.start_time)

        if open_at and close_at and open_at >= close_at:
            raise ValueError("Registration open date must be earlier than registration close date.")

        if close_at and start_at and close_at > start_at:
            raise ValueError("Registration close date must be on or before tournament start time.")

        return self


class AdminUpdateTournamentRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    rules: str | None = Field(default=None, max_length=10000)
    banner_url: str | None = Field(default=None, max_length=1000)
    game: str | None = Field(default=None, max_length=50)
    platform: str | None = Field(default=None, max_length=50)
    team_size: int | None = Field(default=None, ge=1, le=10)
    max_teams: int | None = Field(default=None, ge=2, le=512)
    entry_fee: float | None = Field(default=None, ge=0.0)
    entry_fee_currency: str | None = Field(default=None, max_length=3)
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    start_time: datetime | None = None
    timezone: str | None = Field(default=None, max_length=50)
    format: str | None = Field(
        default=None, pattern="^(single_elimination|double_elimination|round_robin)$"
    )

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if len(s) < 3:
            raise ValueError("Tournament title must be at least 3 characters.")
        return s

    @model_validator(mode="after")
    def validate_dates(self) -> AdminUpdateTournamentRequest:
        open_at = _ensure_utc(self.registration_open_at)
        close_at = _ensure_utc(self.registration_close_at)
        start_at = _ensure_utc(self.start_time)

        if open_at and close_at and open_at >= close_at:
            raise ValueError("Registration open date must be earlier than registration close date.")

        if close_at and start_at and close_at > start_at:
            raise ValueError("Registration close date must be on or before tournament start time.")

        return self


class TournamentLifecycleTransitionRequest(BaseModel):
    action: str = Field(
        pattern="^(publish|open_registration|close_registration|start_live|pause|resume|complete|cancel)$",
        description="Target lifecycle action",
    )
    reason: str | None = Field(default=None, max_length=500)


class AdminDeleteTournamentRequest(BaseModel):
    reason: str | None = Field(
        default="Admin deleted tournament",
        max_length=500,
        description="Reason for tournament deletion",
    )
    confirmation_title: str | None = Field(
        default=None, max_length=200, description="Must match tournament title for UI confirmation"
    )


class AdminDeleteTournamentResponse(BaseModel):
    success: bool = True
    deleted: bool = True
    deletedTournamentId: str | None = None
    deleted_tournament_id: str | None = None
    soft_deleted: bool | None = None
    tournament_id: str
    tournament_name: str
    rows_deleted: int = 1
    related_records_deleted: dict[str, int] | None = None
    deleted_by: str | None = None
    delete_reason: str | None = None
    message: str | None = None


class AdminTournamentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    slug: str
    game: str
    platform: str = "PC"
    status: str
    team_size: int = 5
    max_teams: int
    registered_count: int = 0
    checked_in_count: int = 0
    paid_count: int = 0
    entry_fee_minor: int = 0
    entry_fee_currency: str = "INR"
    registration_open_at: str
    registration_close_at: str
    start_time: str
    banner_url: str | None = None
    format: str = "single_elimination"
    is_registration_open: bool = False
    created_at: str
    updated_at: str | None = None
    deleted_by: str | None = None
    delete_reason: str | None = None


class AdminTournamentListResponse(BaseModel):
    items: list[AdminTournamentListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminTournamentDetailResponse(AdminTournamentListItem):
    description: str | None = None
    rules: str | None = None
    timezone: str = "UTC"
    published_at: str | None = None
    paused_at: str | None = None
    resumed_at: str | None = None
    cancelled_at: str | None = None
    completed_at: str | None = None
    created_by: str | None = None
    is_power_of_two: bool = True
