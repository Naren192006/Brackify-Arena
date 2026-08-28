"""Game plugin layer — core platform stays game-agnostic."""

from typing import Any, Protocol


class GameAdapter(Protocol):
    slug: str
    name: str

    def validate_tournament_config(self, config: dict[str, Any]) -> dict[str, Any]:
        """Validate and normalize game-specific tournament configuration."""
        ...

    def validate_roster(self, roster_user_ids: list[str], rules: dict[str, Any]) -> None:
        """Validate team roster for tournament registration."""
        ...


class GameRegistry:
    def __init__(self) -> None:
        self._adapters: dict[str, GameAdapter] = {}

    def register(self, adapter: GameAdapter) -> None:
        self._adapters[adapter.slug] = adapter

    def get(self, slug: str) -> GameAdapter | None:
        return self._adapters.get(slug)

    def list_slugs(self) -> list[str]:
        return list(self._adapters.keys())


game_registry = GameRegistry()
