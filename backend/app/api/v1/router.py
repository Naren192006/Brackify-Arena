from fastapi import APIRouter

from app.api.v1 import (
    admin,
    admin_auth,
    auth,
    brackets,
    match_reports,
    matches,
    payments,
    teams,
    tournaments,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admin_auth.router)
api_router.include_router(users.router)
api_router.include_router(teams.router)
api_router.include_router(tournaments.router)
api_router.include_router(payments.router)
api_router.include_router(brackets.router)
api_router.include_router(matches.router)
api_router.include_router(match_reports.router)
api_router.include_router(admin.router)
