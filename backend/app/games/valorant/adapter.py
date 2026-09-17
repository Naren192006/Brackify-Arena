from typing import Any

from app.games.base import game_registry


class ValorantAdapter:
    slug = "valorant"
    name = "VALORANT"

    def validate_tournament_config(self, config: dict[str, Any]) -> dict[str, Any]:
        mode = config.get("mode", "5v5")
        if mode not in ("5v5",):
            raise ValueError("Unsupported VALORANT mode")
        return {"mode": mode, **config}

    def validate_roster(self, roster_user_ids: list[str], rules: dict[str, Any]) -> None:
        min_players = rules.get("min_players", 5)
        max_players = rules.get("max_players", 5)
        count = len(roster_user_ids)
        if count < min_players or count > max_players:
            raise ValueError(f"Roster must have between {min_players} and {max_players} players")


def register_valorant() -> None:
    game_registry.register(ValorantAdapter())  # type: ignore[arg-type]
