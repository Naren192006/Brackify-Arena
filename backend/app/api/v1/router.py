from fastapi import APIRouter

from app.api.v1 import auth, tournaments, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tournaments.router)
