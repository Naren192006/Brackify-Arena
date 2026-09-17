from datetime import UTC, datetime
from uuid import uuid4

from app.schemas.tournaments import TournamentListItem, TournamentPage


def test_tournament_page_contract_is_lean():
    item = TournamentListItem(
        id=uuid4(),
        slug="valorant-open",
        title="VALORANT Open",
        status="published",
        game_slug="valorant",
        game_name="VALORANT",
        banner_url=None,
        prize_pool_minor=100000,
        entry_fee_minor=0,
        currency="INR",
        starts_at=datetime.now(UTC),
        registration_deadline=datetime.now(UTC),
        capacity=32,
    )
    page = TournamentPage(items=[item], page=1, page_size=12, total=1, has_next=False)
    assert page.items[0].game_slug == "valorant"
