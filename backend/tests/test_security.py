from app.core.security import create_access_token, decode_access_token


def test_access_token_identity_is_authoritative_from_database_lookup():
    token = create_access_token("00000000-0000-0000-0000-000000000001", "admin")
    payload = decode_access_token(token)
    assert payload == {"sub": "00000000-0000-0000-0000-000000000001"}
