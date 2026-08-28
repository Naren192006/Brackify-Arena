from app.games.valorant.adapter import ValorantAdapter


def test_valorant_roster_validation():
    adapter = ValorantAdapter()
    adapter.validate_roster(["1", "2", "3", "4", "5"], {"min_players": 5, "max_players": 5})


def test_valorant_roster_validation_fails():
    adapter = ValorantAdapter()
    try:
        adapter.validate_roster(["1", "2"], {"min_players": 5, "max_players": 5})
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_valorant_config_validation():
    adapter = ValorantAdapter()
    result = adapter.validate_tournament_config({"mode": "5v5", "map_pool": ["Ascent"]})
    assert result["mode"] == "5v5"
