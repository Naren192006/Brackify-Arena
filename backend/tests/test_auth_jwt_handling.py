import json
import time

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.auth import (
    _is_valid_jwt_format,
    encode_supabase_jwt,
    extract_token,
    get_current_auth_user,
)


def _make_request(headers=None, cookies=None):
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/test",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
    }
    req = Request(scope)
    req._cookies = cookies or {}
    return req


def test_is_valid_jwt_format():
    assert not _is_valid_jwt_format(None)
    assert not _is_valid_jwt_format("")
    assert not _is_valid_jwt_format("undefined")
    assert not _is_valid_jwt_format("null")
    assert not _is_valid_jwt_format("[object Object]")
    assert not _is_valid_jwt_format("onlyonepart")
    assert not _is_valid_jwt_format("two.parts")
    assert not _is_valid_jwt_format("four.parts.here.extra")
    assert _is_valid_jwt_format("part1.part2.part3")


def test_extract_token_from_authorization_header():
    req = _make_request(headers={"Authorization": "Bearer part1.part2.part3"})
    assert extract_token(req) == "part1.part2.part3"


def test_extract_token_ignores_malformed_header():
    req1 = _make_request(headers={"Authorization": "Bearer undefined"})
    assert extract_token(req1) is None

    req2 = _make_request(headers={"Authorization": "Bearer [object Object]"})
    assert extract_token(req2) is None

    req3 = _make_request(headers={"Authorization": "Bearer not_a_jwt"})
    assert extract_token(req3) is None


def test_extract_token_ignores_chunked_cookies():
    req = _make_request(cookies={"sb-ref-auth-token.0": "base64-randomchunkcontent=="})
    assert extract_token(req) is None


def test_extract_token_parses_json_cookie_with_jwt():
    jwt_val = "aaa.bbb.ccc"
    req = _make_request(cookies={"sb-ref-auth-token": json.dumps([jwt_val, "refresh_token"])})
    assert extract_token(req) == jwt_val


@pytest.mark.asyncio
async def test_get_current_auth_user_missing_token_raises_401():
    req = _make_request()
    with pytest.raises(HTTPException) as exc_info:
        await get_current_auth_user(req)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["code"] == "unauthorized"
    assert "Bearer token missing" in exc_info.value.detail["message"]


@pytest.mark.asyncio
async def test_get_current_auth_user_valid_token():
    payload = {
        "sub": "00000000-0000-0000-0000-000000000001",
        "email": "test@example.com",
        "role": "authenticated",
        "exp": time.time() + 3600,
    }
    token = encode_supabase_jwt(payload)
    req = _make_request(headers={"Authorization": f"Bearer {token}"})
    user = await get_current_auth_user(req)
    assert user.id == "00000000-0000-0000-0000-000000000001"
    assert user.email == "test@example.com"


@pytest.mark.asyncio
async def test_get_current_auth_user_expired_token():
    payload = {
        "sub": "00000000-0000-0000-0000-000000000001",
        "email": "test@example.com",
        "exp": time.time() - 3600,
    }
    token = encode_supabase_jwt(payload)
    req = _make_request(headers={"Authorization": f"Bearer {token}"})
    with pytest.raises(HTTPException) as exc_info:
        await get_current_auth_user(req)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["code"] == "invalid_token"
    assert "expired" in exc_info.value.detail["message"]
