"""Tests for the public tournament reads (list_public / get_public).

These reads go through Supabase REST with the *real* prod schema (game as text,
no prize_pool_minor, native status enum with values like "ongoing"), so the
tests mock the PostgREST HTTP surface instead of ORM rows.
"""

import json
from typing import Any

import httpx
import pytest

from app.config import settings
from app.services import tournament_service as ts
from app.services.tournament_service import TournamentService


def _prod_shape_row(**overrides: Any) -> dict[str, Any]:
    """A tournaments row exactly as prod stores it."""
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Summer Valorant Cup",
        "slug": "summer-valorant-cup",
        "game": "VALORANT",
        "mode": "5v5",
        "description": "Open bracket, double elim.",
        "rules": "Be nice. No smurfs.",
        "max_teams": 16,
        "registration_open_at": "2026-09-01T00:00:00+00:00",
        "registration_close_at": "2099-09-20T00:00:00+00:00",
        "start_time": "2099-09-30T00:00:00+00:00",
        "status": "open",
        "created_by": "22222222-2222-2222-2222-222222222222",
        "banner_url": "https://example.com/banner.png",
        "entry_fee_minor": 50000,
        "entry_fee_currency": "INR",
        "checkin_close_at": None,
        "completed_at": None,
    }
    row.update(overrides)
    return row


class _PostgRESTMock:
    """Minimal PostgREST imitation for the two tables these reads touch."""

    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = [_prod_shape_row()]
        self.registrations_per_tournament = 3
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path.rstrip("/").split("/")[-1]
        params = dict(request.url.params)

        if path == "tournaments":
            rows = list(self.rows)
            # Honor the exclusion + simple eq/not.in filters the code sends.
            status_param = params.get("status", "")
            if status_param.startswith("not.in."):
                banned = status_param.removeprefix("not.in.(").rstrip(")").split(",")
                rows = [r for r in rows if r["status"] not in banned]
            elif status_param.startswith("eq."):
                wanted = status_param.removeprefix("eq.")
                rows = [r for r in rows if r["status"] == wanted]
            slug = params.get("slug", "")
            if slug.startswith("eq."):
                wanted = slug.removeprefix("eq.")
                rows = [r for r in rows if r["slug"] == wanted]
            if "limit" in params:
                rows = rows[: int(params["limit"])]

            headers = {}
            if "count=exact" in request.headers.get("Prefer", ""):
                headers["Content-Range"] = f"0-{max(0, len(rows) - 1)}/{len(rows)}"
            return httpx.Response(200, json=rows, headers=headers)

        if path == "tournament_registrations":
            tid = params.get("tournament_id", "")
            count = self.registrations_per_tournament if "eq." in tid else 0
            return httpx.Response(
                200, json=[{"id": f"reg-{i}"} for i in range(count)]
            )

        return httpx.Response(404, json={"message": "not mocked"})


@pytest.fixture
async def rest_mock(monkeypatch: pytest.MonkeyPatch) -> _PostgRESTMock:
    mock = _PostgRESTMock()
    original_client = httpx.AsyncClient

    def _client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(mock.handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(ts.httpx, "AsyncClient", _client_factory)
    monkeypatch.setattr(settings, "supabase_url", "https://sb.test")
    monkeypatch.setattr(settings, "supabase_service_role_key", "svc-key")
    return mock


async def test_list_public_maps_prod_schema_rows(rest_mock: _PostgRESTMock) -> None:
    page = await TournamentService(None).list_public(
        page=1,
        page_size=12,
        search=None,
        game=None,
        status=None,
        min_entry_fee=None,
        max_entry_fee=None,
    )

    assert page.total == 1
    assert page.has_next is False
    item = page.items[0]
    assert item.slug == "summer-valorant-cup"
    assert item.game_slug == "valorant"  # prod stores game as text
    assert item.status == "open"
    assert item.computed_status == "REGISTRATION_OPEN"
    assert item.capacity == 16
    assert item.filled_slots == 3  # from tournament_registrations count
    assert item.remaining_slots == 13
    assert item.entry_fee_minor == 50000
    assert item.prize_pool_minor == 0  # prod has no prize pool column


async def test_list_public_ongoing_maps_to_live(rest_mock: _PostgRESTMock) -> None:
    rest_mock.rows = [_prod_shape_row(status="ongoing")]
    page = await TournamentService(None).list_public(
        page=1,
        page_size=12,
        search=None,
        game=None,
        status=None,
        min_entry_fee=None,
        max_entry_fee=None,
    )
    assert page.items[0].status == "ongoing"
    assert page.items[0].computed_status == "LIVE"


async def test_list_public_excludes_draft_and_cancelled(
    rest_mock: _PostgRESTMock,
) -> None:
    await TournamentService(None).list_public(
        page=1,
        page_size=12,
        search=None,
        game=None,
        status=None,
        min_entry_fee=None,
        max_entry_fee=None,
    )
    list_req = next(r for r in rest_mock.requests if r.url.path.endswith("tournaments"))
    assert "not.in.(draft,cancelled)" == dict(list_req.url.params)["status"]


async def test_list_public_fee_range_sends_two_filters(
    rest_mock: _PostgRESTMock,
) -> None:
    await TournamentService(None).list_public(
        page=1,
        page_size=12,
        search=None,
        game=None,
        status=None,
        min_entry_fee=100,
        max_entry_fee=900,
    )
    list_req = next(r for r in rest_mock.requests if r.url.path.endswith("tournaments"))
    fee_values = [v for k, v in list_req.url.params.multi_items() if k == "entry_fee_minor"]
    assert sorted(fee_values) == ["gte.100", "lte.900"]


async def test_get_public_returns_detail_with_text_rules(
    rest_mock: _PostgRESTMock,
) -> None:
    detail = await TournamentService(None).get_public("summer-valorant-cup")
    assert detail is not None
    assert detail.slug == "summer-valorant-cup"
    assert detail.rules == "Be nice. No smurfs."
    assert detail.description == "Open bracket, double elim."
    assert detail.organizer_id is not None
    assert detail.filled_slots == 3


async def test_get_public_parses_json_rules_object(rest_mock: _PostgRESTMock) -> None:
    rest_mock.rows = [_prod_shape_row(rules=json.dumps({"format": "double elim"}))]
    detail = await TournamentService(None).get_public("summer-valorant-cup")
    assert detail is not None
    assert detail.rules == {"format": "double elim"}


async def test_get_public_missing_slug_returns_none(rest_mock: _PostgRESTMock) -> None:
    detail = await TournamentService(None).get_public("does-not-exist")
    assert detail is None
