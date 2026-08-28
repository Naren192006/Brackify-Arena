from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.tournament import TournamentStatus
from app.schemas.tournaments import TournamentDetail, TournamentPage
from app.services.tournament_service import TournamentService

router = APIRouter(prefix="/tournaments", tags=["tournaments"])


@router.get("", response_model=TournamentPage)
async def list_tournaments(
    page: int = Query(1, ge=1), page_size: int = Query(12, ge=1, le=50),
    search: str | None = Query(None, max_length=100), game: str | None = Query(None, max_length=50),
    status_filter: TournamentStatus | None = Query(None, alias="status"),
    min_entry_fee: int | None = Query(None, ge=0), max_entry_fee: int | None = Query(None, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> TournamentPage:
    return await TournamentService(session).list_public(
        page=page, page_size=page_size, search=search, game=game, status=status_filter,
        min_entry_fee=min_entry_fee, max_entry_fee=max_entry_fee,
    )


@router.get("/{slug}", response_model=TournamentDetail)
async def get_tournament(slug: str, session: AsyncSession = Depends(get_db_session)) -> TournamentDetail:
    tournament = await TournamentService(session).get_public(slug)
    if tournament is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
    return tournament
