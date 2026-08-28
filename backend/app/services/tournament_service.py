from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tournament import Tournament, TournamentStatus
from app.schemas.tournaments import TournamentDetail, TournamentListItem, TournamentPage


def _list_item(tournament: Tournament) -> TournamentListItem:
    return TournamentListItem(
        id=tournament.id, slug=tournament.slug, title=tournament.title,
        status=tournament.status.value, game_slug=tournament.game.slug, game_name=tournament.game.name,
        banner_url=tournament.banner_url, prize_pool_minor=tournament.prize_pool_minor,
        entry_fee_minor=tournament.entry_fee_minor, currency=tournament.currency,
        starts_at=tournament.starts_at, registration_deadline=tournament.registration_deadline,
        capacity=tournament.capacity,
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
