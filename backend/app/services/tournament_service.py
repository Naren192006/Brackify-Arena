from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tournament import Tournament, TournamentStatus
from app.schemas.tournaments import TournamentDetail, TournamentListItem, TournamentPage


from datetime import datetime, timezone

def compute_tournament_lifecycle_status(
    *,
    status: TournamentStatus,
    starts_at: datetime,
    registration_deadline: datetime,
    ends_at: datetime | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    s_at = starts_at if starts_at.tzinfo else starts_at.replace(tzinfo=timezone.utc)
    r_deadline = registration_deadline if registration_deadline.tzinfo else registration_deadline.replace(tzinfo=timezone.utc)
    e_at = ends_at if (ends_at is None or ends_at.tzinfo) else ends_at.replace(tzinfo=timezone.utc)

    if status == TournamentStatus.COMPLETED or (e_at and now >= e_at):
        return "COMPLETED"
    if status == TournamentStatus.LIVE or now >= s_at:
        return "LIVE"
    if now < r_deadline:
        return "REGISTRATION_OPEN"
    return "UPCOMING"


def _list_item(tournament: Tournament, filled_slots: int = 0) -> TournamentListItem:
    rem_slots = max(0, tournament.capacity - filled_slots)
    comp_status = compute_tournament_lifecycle_status(
        status=tournament.status,
        starts_at=tournament.starts_at,
        registration_deadline=tournament.registration_deadline,
        ends_at=tournament.ends_at,
    )
    return TournamentListItem(
        id=tournament.id, slug=tournament.slug, title=tournament.title,
        status=tournament.status.value, computed_status=comp_status,
        game_slug=tournament.game.slug, game_name=tournament.game.name,
        banner_url=tournament.banner_url, prize_pool_minor=tournament.prize_pool_minor,
        entry_fee_minor=tournament.entry_fee_minor, currency=tournament.currency,
        starts_at=tournament.starts_at, registration_deadline=tournament.registration_deadline,
        capacity=tournament.capacity, filled_slots=filled_slots, remaining_slots=rem_slots,
    )



class TournamentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_public(
        self, *, page: int, page_size: int, search: str | None, game: str | None,
        status: TournamentStatus | None, min_entry_fee: int | None, max_entry_fee: int | None,
    ) -> TournamentPage:
        query = select(Tournament).options(selectinload(Tournament.game)).join(Tournament.game).where(Tournament.status != TournamentStatus.DRAFT)
        count_query = select(func.count(Tournament.id)).join(Tournament.game).where(Tournament.status != TournamentStatus.DRAFT)
        predicates = []
        if search:
            pattern = f"%{search.strip()}%"
            predicates.append(or_(Tournament.title.ilike(pattern), Tournament.description.ilike(pattern)))
        if game:
            predicates.append(Tournament.game.has(slug=game))
        if status:
            predicates.append(Tournament.status == status)
        if min_entry_fee is not None:
            predicates.append(Tournament.entry_fee_minor >= min_entry_fee)
        if max_entry_fee is not None:
            predicates.append(Tournament.entry_fee_minor <= max_entry_fee)
        if predicates:
            query = query.where(*predicates)
            count_query = count_query.where(*predicates)
        total = int(await self.session.scalar(count_query) or 0)
        rows = (await self.session.scalars(
            query.order_by(Tournament.starts_at.asc()).offset((page - 1) * page_size).limit(page_size)
        )).all()
        return TournamentPage(items=[_list_item(row) for row in rows], page=page, page_size=page_size, total=total, has_next=page * page_size < total)

    async def get_public(self, slug: str) -> TournamentDetail | None:
        tournament = await self.session.scalar(
            select(Tournament).options(selectinload(Tournament.game)).where(Tournament.slug == slug, Tournament.status != TournamentStatus.DRAFT)
        )
        if tournament is None:
            return None
        item = _list_item(tournament)
        return TournamentDetail(
            **item.model_dump(), description=tournament.description, ends_at=tournament.ends_at,
            rules=tournament.rules, faqs=tournament.faqs, organizer_id=tournament.organizer_id,
            spots_remaining=None,
        )
