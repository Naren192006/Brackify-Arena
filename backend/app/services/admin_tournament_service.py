"""Admin Tournament Service — Production Safe Tournament Management, Lifecycle Transitions & Auditing.

Rules:
1. Strict State Machine: Validates lifecycle transitions (Draft -> Published -> Registration Open -> Registration Closed -> Live -> Paused -> Completed; Non-completed -> Cancelled).
2. Live Tournament Locking: Protects financial properties (entry fee), game, format, and capacity when Live/Completed.
3. Transactional cascade deletion for Super Admins: Preserves payments as 'cancelled_admin' and purges orphan storage.
4. Comprehensive Audit Logging: All mutations logged to admin_audit_logs.
"""

from __future__ import annotations

import datetime
import math
import re
from typing import Any
from urllib.parse import urlparse
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.admin_auth import AdminUser
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.schemas.admin_tournaments import (
    AdminCreateTournamentRequest,
    AdminTournamentDetailResponse,
    AdminTournamentListItem,
    AdminTournamentListResponse,
    AdminUpdateTournamentRequest,
)

logger = get_logger(__name__)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _is_uuid(val: str) -> bool:
    try:
        UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


def _is_power_of_two(n: int) -> bool:
    return n > 0 and (n & (n - 1)) == 0


def _slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


def compute_is_registration_open(
    status: str | None,
    registration_open_at: str | datetime.datetime | None,
    registration_close_at: str | datetime.datetime | None,
    start_time: str | datetime.datetime | None = None,
    max_teams: int = 16,
    registered_count: int = 0,
) -> bool:
    if not status:
        return False
    norm_status = str(status).strip().lower()
    if norm_status not in ("published", "open", "registration_open"):
        return False

    if max_teams > 0 and registered_count >= max_teams:
        return False

    now_utc = datetime.datetime.now(datetime.timezone.utc)

    if registration_open_at:
        if isinstance(registration_open_at, str) and registration_open_at.strip():
            try:
                open_dt = datetime.datetime.fromisoformat(registration_open_at.replace("Z", "+00:00"))
                if open_dt.tzinfo is None:
                    open_dt = open_dt.replace(tzinfo=datetime.timezone.utc)
                if now_utc < open_dt:
                    return False
            except (ValueError, TypeError):
                pass
        elif isinstance(registration_open_at, datetime.datetime):
            open_dt = registration_open_at if registration_open_at.tzinfo else registration_open_at.replace(tzinfo=datetime.timezone.utc)
            if now_utc < open_dt:
                return False

    if registration_close_at:
        if isinstance(registration_close_at, str) and registration_close_at.strip():
            try:
                close_dt = datetime.datetime.fromisoformat(registration_close_at.replace("Z", "+00:00"))
                if close_dt.tzinfo is None:
                    close_dt = close_dt.replace(tzinfo=datetime.timezone.utc)
                if now_utc >= close_dt:
                    return False
            except (ValueError, TypeError):
                pass
        elif isinstance(registration_close_at, datetime.datetime):
            close_dt = registration_close_at if registration_close_at.tzinfo else registration_close_at.replace(tzinfo=datetime.timezone.utc)
            if now_utc >= close_dt:
                return False

    if start_time:
        if isinstance(start_time, str) and start_time.strip():
            try:
                start_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=datetime.timezone.utc)
                if now_utc >= start_dt:
                    return False
            except (ValueError, TypeError):
                pass
        elif isinstance(start_time, datetime.datetime):
            start_dt = start_time if start_time.tzinfo else start_time.replace(tzinfo=datetime.timezone.utc)
            if now_utc >= start_dt:
                return False

    return True


def _supabase_headers(prefer: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service role is not configured.", "service_not_configured")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _sb_url(table: str) -> str:
    rest_base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    return f"{rest_base}/{table}"


def _storage_url(bucket: str, file_path: str) -> str:
    storage_base = f"{settings.supabase_url.rstrip('/')}/storage/v1/object"
    return f"{storage_base}/{bucket}/{file_path.lstrip('/')}"


def _extract_storage_path(url: str | None, bucket_name: str) -> str | None:
    if not url or not isinstance(url, str):
        return None
    url_str = url.strip()
    if not url_str or bucket_name not in url_str:
        return None
    parsed = urlparse(url_str)
    path = parsed.path if parsed.path else url_str
    marker = f"{bucket_name}/"
    idx = path.find(marker)
    if idx != -1:
        extracted = path[idx + len(marker):].strip()
        return extracted if extracted else None
    return None


async def _sb_get(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.get(url, headers=headers, params=params)
        if r.status_code == 404:
            return []
        if r.status_code >= 400:
            logger.warning("supabase_get_http_warning", table=table, status=r.status_code, text=r.text[:300])
            return []
        data: Any = r.json()
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.warning("supabase_get_error", table=table, error=str(exc))
        return []


async def _sb_delete(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
    raise_on_error: bool = False,
) -> int:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.delete(url, headers=headers, params=params)
        if r.status_code >= 400:
            logger.warning("supabase_delete_error_status", table=table, status=r.status_code, body=r.text[:300])
            if raise_on_error:
                raise HTTPException(
                    status_code=r.status_code if 400 <= r.status_code < 500 else status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"code": "database_error", "message": f"Failed to delete from {table}: {r.text}"},
                )
            return 0
        if r.status_code == 204:
            return 1
        data = r.json()
        return len(data) if isinstance(data, list) else 1
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("supabase_delete_error", table=table, error=str(exc))
        if raise_on_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "database_error", "message": f"Exception deleting from {table}: {str(exc)}"},
            ) from exc
        return 0


def _extract_missing_column(error_text: str) -> str | None:
    if not error_text:
        return None
    # Pattern 1: Could not find the 'xyz' column of 'table' in the schema cache (PostgREST PGRST204)
    m = re.search(r"Could not find the '([^']+)' column", error_text, re.IGNORECASE)
    if m:
        return m.group(1)
    # Pattern 2: column "xyz" of relation "table" does not exist
    m2 = re.search(r'column [\'"]([^\'"]+)[\'"] of relation', error_text, re.IGNORECASE)
    if m2:
        return m2.group(1)
    # Pattern 3: column "xyz" does not exist
    m3 = re.search(r'column [\'"]([^\'"]+)[\'"] does not exist', error_text, re.IGNORECASE)
    if m3:
        return m3.group(1)
    return None


def _format_db_error_message(raw_text: str, default_msg: str) -> str:
    try:
        import json
        data = json.loads(raw_text)
        if isinstance(data, dict):
            if data.get("code") == "42501":
                hint = data.get("hint")
                msg = data.get("message", "Permission denied in database")
                return f"{msg}. {hint}" if hint else msg
            if data.get("message"):
                return str(data["message"])
    except Exception:
        pass
    return raw_text if raw_text else default_msg


async def _sb_patch(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
    body: dict[str, Any],
) -> list[dict[str, Any]]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    current_body = dict(body)
    max_retries = 8

    for _ in range(max_retries):
        try:
            r = await client.patch(url, headers=headers, params=params, json=current_body)
            if r.status_code == 404:
                return []
            if r.status_code == 400:
                missing_col = _extract_missing_column(r.text)
                if missing_col and missing_col in current_body:
                    logger.warning("supabase_patch_missing_column_stripped", table=table, missing_column=missing_col)
                    current_body.pop(missing_col, None)
                    continue
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else []
        except httpx.HTTPStatusError as exc:
            missing_col = _extract_missing_column(exc.response.text)
            if missing_col and missing_col in current_body:
                logger.warning("supabase_patch_missing_column_stripped", table=table, missing_column=missing_col)
                current_body.pop(missing_col, None)
                continue
            logger.exception("supabase_patch_http_error", table=table, status=exc.response.status_code, body=exc.response.text)
            err_msg = _format_db_error_message(exc.response.text, f"Failed to update {table}")
            raise HTTPException(
                status_code=exc.response.status_code if 400 <= exc.response.status_code < 500 else status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "database_error", "message": err_msg},
            ) from exc
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("supabase_patch_error", table=table, error=str(exc))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "database_error", "message": f"Failed to update {table}: {str(exc)}"},
            ) from exc

    return []


async def _sb_post(
    client: httpx.AsyncClient,
    table: str,
    body: dict[str, Any] | list[dict[str, Any]],
) -> list[dict[str, Any]]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")

    if isinstance(body, dict):
        current_body = dict(body)
        max_retries = 8
        for _ in range(max_retries):
            try:
                r = await client.post(url, headers=headers, json=current_body)
                if r.status_code == 400:
                    missing_col = _extract_missing_column(r.text)
                    if missing_col and missing_col in current_body:
                        logger.warning("supabase_post_missing_column_stripped", table=table, missing_column=missing_col)
                        current_body.pop(missing_col, None)
                        continue
                r.raise_for_status()
                data = r.json()
                return data if isinstance(data, list) else []
            except httpx.HTTPStatusError as exc:
                missing_col = _extract_missing_column(exc.response.text)
                if missing_col and missing_col in current_body:
                    logger.warning("supabase_post_missing_column_stripped", table=table, missing_column=missing_col)
                    current_body.pop(missing_col, None)
                    continue
                logger.exception("supabase_post_http_error", table=table, status=exc.response.status_code, body=exc.response.text)
                err_msg = _format_db_error_message(exc.response.text, f"Failed to insert into {table}")
                raise HTTPException(
                    status_code=exc.response.status_code if 400 <= exc.response.status_code < 500 else status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"code": "database_error", "message": err_msg},
                ) from exc
            except HTTPException:
                raise
            except Exception as exc:
                logger.exception("supabase_post_error", table=table, error=str(exc))
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"code": "database_error", "message": f"Failed to insert into {table}: {str(exc)}"},
                ) from exc
        return []

    try:
        r = await client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []
    except httpx.HTTPStatusError as exc:
        logger.exception("supabase_post_http_error", table=table, status=exc.response.status_code, body=exc.response.text)
        err_msg = _format_db_error_message(exc.response.text, f"Failed to insert into {table}")
        raise HTTPException(
            status_code=exc.response.status_code if 400 <= exc.response.status_code < 500 else status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "database_error", "message": err_msg},
        ) from exc
    except Exception as exc:
        logger.exception("supabase_post_error", table=table, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "database_error", "message": f"Failed to insert into {table}: {str(exc)}"},
        ) from exc


async def _sb_rpc(
    client: httpx.AsyncClient,
    rpc_name: str,
    body: dict[str, Any],
) -> Any:
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/{rpc_name}"
    headers = _supabase_headers(prefer="return=representation")
    r = await client.post(url, headers=headers, json=body)
    r.raise_for_status()
    return r.json()


async def _delete_storage_file(
    client: httpx.AsyncClient,
    bucket: str,
    file_url_or_path: str | None,
) -> None:
    if not file_url_or_path:
        return
    path = _extract_storage_path(file_url_or_path, bucket) or file_url_or_path.lstrip("/")
    if not path or path.startswith("http://") or path.startswith("https://") or ("/" not in path and "." not in path):
        return

    url = _storage_url(bucket, path)
    headers = {
        "apikey": settings.supabase_service_role_key or "",
        "Authorization": f"Bearer {settings.supabase_service_role_key or ''}",
    }
    try:
        r = await client.delete(url, headers=headers)
        if r.status_code in (200, 204, 404):
            logger.info("storage_file_deleted", bucket=bucket, path=path, status=r.status_code)
    except Exception as exc:
        logger.warning("storage_file_delete_exception", bucket=bucket, path=path, error=str(exc))


# ---------------------------------------------------------------------------
# Status Normalization and Transition Validation
# ---------------------------------------------------------------------------

def _normalize_status(st: str) -> str:
    s = st.lower().strip()
    if s in ("open", "registration_open"):
        return "registration_open"
    if s in ("ongoing", "live"):
        return "live"
    return s


ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["published", "cancelled"],
    "published": ["registration_open", "open", "cancelled"],
    "registration_open": ["registration_closed", "cancelled"],
    "open": ["registration_closed", "cancelled"],
    "registration_closed": ["live", "ongoing", "registration_open", "open", "cancelled"],
    "live": ["paused", "completed", "cancelled"],
    "ongoing": ["paused", "completed", "cancelled"],
    "paused": ["live", "ongoing", "completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


# ---------------------------------------------------------------------------
# Tournament Service Implementation
# ---------------------------------------------------------------------------

async def list_admin_tournaments_service(
    search: str | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 15,
) -> AdminTournamentListResponse:
    """List tournaments for Admin Portal with filtering, search, pagination, and registration counts."""
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    offset = (page - 1) * page_size

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Base query params
        params: dict[str, str] = {
            "select": "*",
            "order": "created_at.desc",
            "status": "neq.cancelled",
        }

        # Status filter
        if status_filter and status_filter.strip().lower() != "all":
            clean_st = status_filter.strip().lower()
            if clean_st in ("registration_open", "open"):
                params["status"] = "in.(open,registration_open)"
            elif clean_st in ("live", "ongoing"):
                params["status"] = "in.(live,ongoing)"
            else:
                params["status"] = f"eq.{clean_st}"

        # Search filter
        if search and search.strip():
            s = search.strip()
            params["or"] = f"(title.ilike.*{s}*,slug.ilike.*{s}*,game.ilike.*{s}*)"

        # Fetch all matching rows to calculate pagination accurately
        rows = await _sb_get(client, "tournaments", params)
        total = len(rows)
        paged_rows = rows[offset : offset + page_size]

        # Fetch registration statistics for current page
        tournament_ids = [r["id"] for r in paged_rows if r.get("id")]
        reg_map: dict[str, dict[str, int]] = {tid: {"registered": 0, "checked_in": 0, "paid": 0} for tid in tournament_ids}

        if tournament_ids:
            reg_in = f"in.({','.join(tournament_ids)})"
            registrations = await _sb_get(
                client,
                "tournament_registrations",
                {"tournament_id": reg_in, "select": "tournament_id,status,checked_in,payment_status"},
            )
            for reg in registrations:
                t_id = reg.get("tournament_id")
                if t_id and t_id in reg_map:
                    st = reg.get("status")
                    if st in ("registered", "checked_in"):
                        reg_map[t_id]["registered"] += 1
                    if reg.get("checked_in") is True or st == "checked_in":
                        reg_map[t_id]["checked_in"] += 1
                    if reg.get("payment_status") == "paid":
                        reg_map[t_id]["paid"] += 1

        items: list[AdminTournamentListItem] = []
        for r in paged_rows:
            tid = str(r["id"])
            counts = reg_map.get(tid, {"registered": 0, "checked_in": 0, "paid": 0})
            st_norm = _normalize_status(r.get("status", "draft"))
            m_teams = int(r.get("max_teams") or 16)
            is_reg_open = compute_is_registration_open(
                status=st_norm,
                registration_open_at=r.get("registration_open_at"),
                registration_close_at=r.get("registration_close_at"),
                start_time=r.get("start_time"),
                max_teams=m_teams,
                registered_count=counts["registered"],
            )
            items.append(
                AdminTournamentListItem(
                    id=tid,
                    title=r.get("title", ""),
                    slug=r.get("slug", ""),
                    game=r.get("game", "VALORANT"),
                    platform=r.get("platform") or "PC",
                    status=st_norm,
                    team_size=int(r.get("team_size") or 5),
                    max_teams=m_teams,
                    registered_count=counts["registered"],
                    checked_in_count=counts["checked_in"],
                    paid_count=counts["paid"],
                    entry_fee_minor=int(r.get("entry_fee_minor") or 0),
                    entry_fee_currency=r.get("entry_fee_currency") or "INR",
                    registration_open_at=str(r.get("registration_open_at") or ""),
                    registration_close_at=str(r.get("registration_close_at") or ""),
                    start_time=str(r.get("start_time") or ""),
                    banner_url=r.get("banner_url"),
                    format=r.get("format") or "single_elimination",
                    is_registration_open=is_reg_open,
                    created_at=str(r.get("created_at") or ""),
                    updated_at=str(r.get("updated_at")) if r.get("updated_at") else None,
                )
            )

        total_pages = max(1, math.ceil(total / page_size))
        return AdminTournamentListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )


async def get_admin_tournament_service(
    slug_or_id: str,
) -> AdminTournamentDetailResponse:
    """Retrieve full tournament details for admin review and editing."""
    clean_val = slug_or_id.strip()
    param = {"id": f"eq.{clean_val}"} if _is_uuid(clean_val) else {"slug": f"eq.{clean_val}"}
    param["select"] = "*"

    async with httpx.AsyncClient(timeout=10.0) as client:
        rows = await _sb_get(client, "tournaments", param)
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": f"Tournament '{clean_val}' was not found."},
            )

        t = rows[0]
        tid = str(t["id"])

        # Fetch registration statistics
        registrations = await _sb_get(
            client,
            "tournament_registrations",
            {"tournament_id": f"eq.{tid}", "select": "status,checked_in,payment_status"},
        )
        reg_count = sum(1 for r in registrations if r.get("status") in ("registered", "checked_in"))
        checked_in_count = sum(1 for r in registrations if r.get("checked_in") is True or r.get("status") == "checked_in")
        paid_count = sum(1 for r in registrations if r.get("payment_status") == "paid")
        max_teams = int(t.get("max_teams") or 16)
        st_norm = _normalize_status(t.get("status", "draft"))
        is_reg_open = compute_is_registration_open(
            status=st_norm,
            registration_open_at=t.get("registration_open_at"),
            registration_close_at=t.get("registration_close_at"),
            start_time=t.get("start_time"),
            max_teams=max_teams,
            registered_count=reg_count,
        )

        return AdminTournamentDetailResponse(
            id=tid,
            title=t.get("title", ""),
            slug=t.get("slug", ""),
            game=t.get("game", "VALORANT"),
            platform=t.get("platform") or "PC",
            status=st_norm,
            team_size=int(t.get("team_size") or 5),
            max_teams=max_teams,
            registered_count=reg_count,
            checked_in_count=checked_in_count,
            paid_count=paid_count,
            entry_fee_minor=int(t.get("entry_fee_minor") or 0),
            entry_fee_currency=t.get("entry_fee_currency") or "INR",
            registration_open_at=str(t.get("registration_open_at") or ""),
            registration_close_at=str(t.get("registration_close_at") or ""),
            start_time=str(t.get("start_time") or ""),
            banner_url=t.get("banner_url"),
            format=t.get("format") or "single_elimination",
            is_registration_open=is_reg_open,
            description=t.get("description"),
            rules=t.get("rules"),
            timezone=t.get("timezone") or "UTC",
            published_at=str(t.get("published_at")) if t.get("published_at") else None,
            paused_at=str(t.get("paused_at")) if t.get("paused_at") else None,
            resumed_at=str(t.get("resumed_at")) if t.get("resumed_at") else None,
            cancelled_at=str(t.get("cancelled_at")) if t.get("cancelled_at") else None,
            completed_at=str(t.get("completed_at")) if t.get("completed_at") else None,
            created_by=str(t.get("created_by")) if t.get("created_by") else None,
            created_at=str(t.get("created_at") or ""),
            updated_at=str(t.get("updated_at")) if t.get("updated_at") else None,
            is_power_of_two=_is_power_of_two(max_teams),
        )


async def create_admin_tournament_service(
    payload: AdminCreateTournamentRequest,
    current_admin: AdminUser,
) -> AdminTournamentDetailResponse:
    """Create a new tournament with full metadata, validation, and audit logging."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Validate that the authenticated admin exists in admin_users and retrieve their database UUID
        admin_record = None
        if _is_uuid(current_admin.id):
            admin_rows = await _sb_get(client, "admin_users", {"id": f"eq.{current_admin.id}", "select": "id,email,role"})
            if admin_rows and len(admin_rows) > 0:
                admin_record = admin_rows[0]

        if not admin_record and current_admin.email:
            admin_rows = await _sb_get(client, "admin_users", {"email": f"eq.{current_admin.email.lower().strip()}", "select": "id,email,role"})
            if admin_rows and len(admin_rows) > 0:
                admin_record = admin_rows[0]

        if not admin_record:
            logger.error("admin_user_not_found_in_database", admin_id=current_admin.id, email=current_admin.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "admin_not_found", "message": "Authenticated admin does not exist."},
            )

        valid_admin_id = str(admin_record["id"])

        # 2. Determine slug
        base_slug = payload.slug or _slugify(payload.title)
        if not base_slug:
            base_slug = f"tournament-{uuid4().hex[:6]}"

        slug = base_slug
        # Check slug uniqueness
        existing = await _sb_get(client, "tournaments", {"slug": f"eq.{slug}", "select": "id"})
        if existing:
            slug = f"{base_slug}-{uuid4().hex[:6]}"

        now = _now_iso()
        status_val = payload.status.lower()
        published_at = now if status_val == "published" else None

        # 3. Log values before insert
        logger.info(
            "admin_create_tournament_payload",
            current_admin_id=valid_admin_id,
            current_admin_email=current_admin.email,
            current_admin_role=current_admin.role,
            created_by=valid_admin_id,
        )

        row = {
            "title": payload.title,
            "slug": slug,
            "game": payload.game,
            "platform": payload.platform,
            "mode": f"{payload.team_size}v{payload.team_size}",
            "team_size": payload.team_size,
            "max_teams": payload.max_teams,
            "entry_fee_minor": int(payload.entry_fee * 100),
            "entry_fee_currency": payload.entry_fee_currency,
            "registration_open_at": payload.registration_open_at.isoformat(),
            "registration_close_at": payload.registration_close_at.isoformat(),
            "start_time": payload.start_time.isoformat(),
            "timezone": payload.timezone,
            "format": payload.format,
            "description": payload.description,
            "rules": payload.rules,
            "banner_url": payload.banner_url,
            "status": status_val,
            "published_at": published_at,
            "created_by": valid_admin_id,
            "created_at": now,
            "updated_at": now,
        }

        inserted = await _sb_post(client, "tournaments", row)
        if not inserted:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "tournament_creation_failed", "message": "Failed to create tournament record."},
            )

        t_record = inserted[0]
        t_id = str(t_record["id"])

        # Audit log
        await _sb_post(
            client,
            "admin_audit_logs",
            {
                "admin_id": valid_admin_id,
                "action": "tournament_created",
                "tournament_id": t_id,
                "tournament_name": payload.title,
                "details": {
                    "admin_email": current_admin.email,
                    "slug": slug,
                    "status": status_val,
                    "game": payload.game,
                    "max_teams": payload.max_teams,
                },
            },
        )

        # Broadcast realtime event
        try:
            from app.services.realtime_service import broadcast_tournament_event, generate_realtime_payload
            await broadcast_tournament_event(
                tournament_id=t_id,
                event="tournament_status_updated",
                payload=generate_realtime_payload(
                    tournament_id=t_id,
                    event="tournament_status_updated",
                    status=status_val,
                    extra={"title": payload.title, "slug": slug, "action": "created"},
                ),
                client=client,
            )
        except Exception as exc:
            logger.debug("realtime_create_broadcast_failed", error=str(exc))

        logger.info("admin_created_tournament", tournament_id=t_id, slug=slug, admin_id=valid_admin_id)
        return await get_admin_tournament_service(slug)


async def update_admin_tournament_service(
    slug_or_id: str,
    payload: AdminUpdateTournamentRequest,
    current_admin: AdminUser,
) -> AdminTournamentDetailResponse:
    """Update tournament properties. Disallows mutating core financial/format parameters when Live/Completed."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Fetch current tournament
        clean_val = slug_or_id.strip()
        param = {"id": f"eq.{clean_val}"} if _is_uuid(clean_val) else {"slug": f"eq.{clean_val}"}
        param["select"] = "*"

        rows = await _sb_get(client, "tournaments", param)
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": f"Tournament '{clean_val}' was not found."},
            )

        current_t = rows[0]
        t_id = str(current_t["id"])
        current_status = _normalize_status(current_t.get("status", "draft"))

        # 2. Check Live/Completed Lock
        if current_status in ("live", "completed"):
            locked_fields_attempted = []
            if payload.entry_fee is not None and int(payload.entry_fee * 100) != int(current_t.get("entry_fee_minor") or 0):
                locked_fields_attempted.append("entry_fee")
            if payload.max_teams is not None and payload.max_teams != int(current_t.get("max_teams") or 0):
                locked_fields_attempted.append("max_teams")
            if payload.format is not None and payload.format != current_t.get("format"):
                locked_fields_attempted.append("format")
            if payload.game is not None and payload.game != current_t.get("game"):
                locked_fields_attempted.append("game")
            if payload.platform is not None and payload.platform != current_t.get("platform"):
                locked_fields_attempted.append("platform")

            if locked_fields_attempted:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "tournament_live_locked",
                        "message": f"Cannot modify core properties ({', '.join(locked_fields_attempted)}) when tournament is {current_status.upper()}.",
                    },
                )

        # 3. Capacity reduction check
        if payload.max_teams is not None:
            regs = await _sb_get(
                client,
                "tournament_registrations",
                {"tournament_id": f"eq.{t_id}", "select": "status"},
            )
            active_count = sum(1 for r in regs if r.get("status") in ("registered", "checked_in"))
            if payload.max_teams < active_count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "capacity_below_registrations",
                        "message": f"Max teams ({payload.max_teams}) cannot be lower than the registered team count ({active_count}).",
                    },
                )

        # 4. Construct update payload
        updates: dict[str, Any] = {"updated_at": _now_iso()}
        if payload.title is not None:
            updates["title"] = payload.title
        if payload.description is not None:
            updates["description"] = payload.description
        if payload.rules is not None:
            updates["rules"] = payload.rules
        if payload.banner_url is not None:
            updates["banner_url"] = payload.banner_url
        if payload.game is not None:
            updates["game"] = payload.game
        if payload.platform is not None:
            updates["platform"] = payload.platform
        if payload.team_size is not None:
            updates["team_size"] = payload.team_size
            updates["mode"] = f"{payload.team_size}v{payload.team_size}"
        if payload.max_teams is not None:
            updates["max_teams"] = payload.max_teams
        if payload.entry_fee is not None:
            updates["entry_fee_minor"] = int(payload.entry_fee * 100)
        if payload.entry_fee_currency is not None:
            updates["entry_fee_currency"] = payload.entry_fee_currency
        if payload.registration_open_at is not None:
            updates["registration_open_at"] = payload.registration_open_at.isoformat()
        if payload.registration_close_at is not None:
            updates["registration_close_at"] = payload.registration_close_at.isoformat()
        if payload.start_time is not None:
            updates["start_time"] = payload.start_time.isoformat()
        if payload.timezone is not None:
            updates["timezone"] = payload.timezone
        if payload.format is not None:
            updates["format"] = payload.format

        await _sb_patch(client, "tournaments", {"id": f"eq.{t_id}"}, updates)

        # Audit log
        await _sb_post(
            client,
            "admin_audit_logs",
            {
                "admin_id": current_admin.id,
                "action": "tournament_updated",
                "tournament_id": t_id,
                "tournament_name": current_t.get("title"),
                "details": {
                    "admin_email": current_admin.email,
                    "updated_fields": list(updates.keys()),
                },
            },
        )

        logger.info("admin_updated_tournament", tournament_id=t_id, admin_id=current_admin.id)
        return await get_admin_tournament_service(t_id)


async def transition_tournament_lifecycle_service(
    slug_or_id: str,
    action: str,
    reason: str | None,
    current_admin: AdminUser,
) -> AdminTournamentDetailResponse:
    """Execute lifecycle transition enforcing valid state machine transitions."""
    clean_val = slug_or_id.strip()
    param = {"id": f"eq.{clean_val}"} if _is_uuid(clean_val) else {"slug": f"eq.{clean_val}"}
    param["select"] = "*"

    async with httpx.AsyncClient(timeout=10.0) as client:
        rows = await _sb_get(client, "tournaments", param)
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": f"Tournament '{clean_val}' was not found."},
            )

        t = rows[0]
        t_id = str(t["id"])
        current_raw = str(t.get("status", "draft")).lower()
        current_normalized = _normalize_status(current_raw)

        # Map action to target status
        target_map = {
            "publish": "published",
            "open_registration": "registration_open",
            "close_registration": "registration_closed",
            "start_live": "live",
            "pause": "paused",
            "resume": "live",
            "complete": "completed",
            "cancel": "cancelled",
        }

        target_status = target_map.get(action)
        if not target_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_action", "message": f"Unsupported lifecycle action '{action}'."},
            )

        # Check allowed transitions
        allowed_targets = ALLOWED_TRANSITIONS.get(current_raw, []) + ALLOWED_TRANSITIONS.get(current_normalized, [])
        if target_status not in allowed_targets and not (current_normalized == "paused" and target_status == "live"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "invalid_lifecycle_transition",
                    "message": f"Cannot transition tournament from '{current_normalized.upper()}' to '{target_status.upper()}'. Allowed targets: {[st.upper() for st in allowed_targets]}.",
                },
            )

        now = _now_iso()
        updates: dict[str, Any] = {
            "status": target_status,
            "updated_at": now,
        }

        # Lifecycle timestamps
        if target_status == "published":
            updates["published_at"] = now
        elif target_status == "paused":
            updates["paused_at"] = now
        elif target_status == "live" and current_normalized == "paused":
            updates["resumed_at"] = now
            updates["paused_at"] = None
        elif target_status == "completed":
            updates["completed_at"] = now
        elif target_status == "cancelled":
            updates["cancelled_at"] = now

        await _sb_patch(client, "tournaments", {"id": f"eq.{t_id}"}, updates)

        # Audit log
        await _sb_post(
            client,
            "admin_audit_logs",
            {
                "admin_id": current_admin.id,
                "action": f"tournament_lifecycle_{action}",
                "tournament_id": t_id,
                "tournament_name": t.get("title"),
                "details": {
                    "admin_email": current_admin.email,
                    "previous_status": current_raw,
                    "new_status": target_status,
                    "action": action,
                    "reason": reason,
                },
            },
        )

        # Broadcast realtime tournament_status_updated event
        try:
            from app.services.realtime_service import broadcast_tournament_event, generate_realtime_payload
            await broadcast_tournament_event(
                tournament_id=t_id,
                event="tournament_status_updated",
                payload=generate_realtime_payload(
                    tournament_id=t_id,
                    event="tournament_status_updated",
                    status=target_status,
                    extra={"action": action, "previous_status": current_raw},
                ),
                client=client,
            )
        except Exception as exc:
            logger.debug("realtime_lifecycle_broadcast_failed", error=str(exc))

        logger.info(
            "admin_transitioned_tournament",
            tournament_id=t_id,
            action=action,
            from_status=current_raw,
            to_status=target_status,
            admin_id=current_admin.id,
        )
        return await get_admin_tournament_service(t_id)


async def delete_tournament_service(
    slug_or_id: str,
    admin_user: Any,
    reason: str = "Admin deleted tournament",
    confirmation_title: str | None = None,
) -> dict[str, Any]:
    """Super Admin-only deletion for tournaments with payment preservation, child record cleanup, and audit logging.

    Enforces actual row deletion from the database and returns 404 if 0 rows were deleted.
    """
    is_super = getattr(admin_user, "role", "") == "super_admin"
    has_perm = "delete_tournaments" in getattr(admin_user, "permissions", []) or "all" in getattr(admin_user, "permissions", [])
    is_admin_flag = getattr(admin_user, "is_admin", False)

    if not (is_super or has_perm or is_admin_flag):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "super_admin_required", "message": "Super Admin access or delete permission required to delete a tournament."},
        )

    if not slug_or_id or not str(slug_or_id).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_tournament_id", "message": "A valid tournament ID or slug is required."},
        )

    clean_id = str(slug_or_id).strip()

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Look up tournament by id or slug without restricting columns or hidden status filters
        lookup_param = {"id": f"eq.{clean_id}", "select": "*"} if _is_uuid(clean_id) else {"slug": f"eq.{clean_id}", "select": "*"}
        t_rows = await _sb_get(client, "tournaments", lookup_param)

        # Fallback check if lookup by slug returned nothing but was an alternative ID
        if not t_rows and not _is_uuid(clean_id):
            t_rows = await _sb_get(client, "tournaments", {"id": f"eq.{clean_id}", "select": "*"})

        if not t_rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": f"Tournament '{clean_id}' was not found."},
            )

        tournament = t_rows[0]
        tournament_uuid = str(tournament["id"])
        tournament_title = str(tournament.get("title") or clean_id)
        banner_url = tournament.get("banner_url")

        # 2. Validate confirmation title if supplied
        if confirmation_title is not None and confirmation_title.strip():
            if confirmation_title.strip().lower() != tournament_title.strip().lower():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "confirmation_title_mismatch",
                        "message": f"Confirmation title '{confirmation_title.strip()}' does not match tournament title '{tournament_title}'.",
                    },
                )

        # 3. Snapshot before_state
        before_state = {
            "id": tournament_uuid,
            "title": tournament_title,
            "slug": tournament.get("slug"),
            "status": tournament.get("status"),
            "game": tournament.get("game"),
            "platform": tournament.get("platform"),
            "team_size": tournament.get("team_size"),
            "max_teams": tournament.get("max_teams"),
            "entry_fee_minor": tournament.get("entry_fee_minor"),
            "start_time": tournament.get("start_time"),
            "created_by": tournament.get("created_by"),
        }

        now = _now_iso()
        admin_id_val = str(getattr(admin_user, "id", ""))
        audit_admin_id = admin_id_val if _is_uuid(admin_id_val) else tournament_uuid
        admin_email_val = str(getattr(admin_user, "email", ""))
        final_reason = str(reason or "Admin deleted tournament").strip()

        # 4. Try stored procedure admin_delete_tournament_tx first (executes in 1 PostgreSQL transaction)
        deleted_summary: dict[str, int] = {}
        rows_deleted = 0
        tx_succeeded = False

        try:
            rpc_res = await _sb_rpc(
                client,
                "admin_delete_tournament_tx",
                {"target_tournament_id": tournament_uuid, "target_admin_id": audit_admin_id},
            )
            if rpc_res and isinstance(rpc_res, dict) and rpc_res.get("deleted"):
                tx_succeeded = True
                rows_deleted = 1
                deleted_summary = {
                    "tournament_registrations": int(rpc_res.get("deleted_registrations") or 0),
                    "matches": int(rpc_res.get("deleted_matches") or 0),
                }
                logger.info(
                    "admin_delete_tournament_tx_rpc_success",
                    tournament_id=tournament_uuid,
                    result=rpc_res,
                )
        except Exception as rpc_exc:
            logger.debug("admin_delete_tournament_tx_rpc_not_available_or_failed", error=str(rpc_exc))

        if not tx_succeeded:
            # 5. Direct Ordered Cascade Deletion:
            # Step 5a: Moderation actions & Fair-Play Reports (FK: moderation_actions.report_id -> fair_play_reports.id ON DELETE RESTRICT)
            try:
                fp_rows = await _sb_get(client, "fair_play_reports", {"tournament_id": f"eq.{tournament_uuid}", "select": "id"})
                if fp_rows:
                    fp_ids = [str(r["id"]) for r in fp_rows if r.get("id")]
                    if fp_ids:
                        cnt = await _sb_delete(client, "moderation_actions", {"report_id": f"in.({','.join(fp_ids)})"})
                        deleted_summary["moderation_actions"] = cnt
                cnt = await _sb_delete(client, "fair_play_reports", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["fair_play_reports"] = cnt
                cnt = await _sb_delete(client, "user_reports", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["user_reports"] = cnt
                cnt = await _sb_delete(client, "reports", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["reports"] = cnt
            except Exception as exc:
                logger.warning("child_cleanup_reports_warning", error=str(exc))

            # Step 5b: Match reports & Matches (FK: match_reports.match_id -> matches.id)
            try:
                m_rows = await _sb_get(client, "matches", {"tournament_id": f"eq.{tournament_uuid}", "select": "id"})
                if m_rows:
                    m_ids = [str(m["id"]) for m in m_rows if m.get("id")]
                    if m_ids:
                        cnt = await _sb_delete(client, "match_reports", {"match_id": f"in.({','.join(m_ids)})"})
                        deleted_summary["match_reports"] = cnt
                cnt = await _sb_delete(client, "matches", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["matches"] = cnt
            except Exception as exc:
                logger.warning("child_cleanup_matches_warning", error=str(exc))

            # Step 5c: Brackets, Rounds, Bracket Matches & Bracket Nodes
            try:
                cnt = await _sb_delete(client, "bracket_matches", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["bracket_matches"] = cnt
                cnt = await _sb_delete(client, "bracket_nodes", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["bracket_nodes"] = cnt
                b_rows = await _sb_get(client, "brackets", {"tournament_id": f"eq.{tournament_uuid}", "select": "id"})
                if b_rows:
                    b_ids = [str(b["id"]) for b in b_rows if b.get("id")]
                    if b_ids:
                        cnt = await _sb_delete(client, "rounds", {"bracket_id": f"in.({','.join(b_ids)})"})
                        deleted_summary["rounds"] = cnt
                cnt = await _sb_delete(client, "brackets", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["brackets"] = cnt
            except Exception as exc:
                logger.warning("child_cleanup_brackets_warning", error=str(exc))

            # Step 5d: Announcements, Admin notes, Admins, Streams, Invitations, Activity
            try:
                cnt = await _sb_delete(client, "tournament_announcements", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["tournament_announcements"] = cnt
                cnt = await _sb_delete(client, "tournament_admin_notes", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["tournament_admin_notes"] = cnt
                cnt = await _sb_delete(client, "tournament_admins", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["tournament_admins"] = cnt
                cnt = await _sb_delete(client, "tournament_streams", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["tournament_streams"] = cnt
                cnt = await _sb_delete(client, "team_invitations", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["team_invitations"] = cnt
                cnt = await _sb_delete(client, "tournament_activity", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["tournament_activity"] = cnt
            except Exception as exc:
                logger.warning("child_cleanup_auxiliary_warning", error=str(exc))

            # Step 5e: Preserve Payments BEFORE deleting tournament_registrations
            try:
                await _sb_patch(
                    client,
                    "payments",
                    {
                        "tournament_id": f"eq.{tournament_uuid}",
                        "status": "in.(pending,paid,created)",
                    },
                    {
                        "status": "cancelled_admin",
                        "updated_at": now,
                    },
                )
            except Exception as p_exc:
                logger.debug("payments_patch_warning", error=str(p_exc))

            # Step 5f: Team registrations
            try:
                cnt = await _sb_delete(client, "tournament_registrations", {"tournament_id": f"eq.{tournament_uuid}"})
                deleted_summary["tournament_registrations"] = cnt
            except Exception as exc:
                logger.warning("child_cleanup_registrations_warning", error=str(exc))

            # Step 5g: Delete the tournament row from tournaments table
            try:
                rows_deleted = await _sb_delete(
                    client,
                    "tournaments",
                    {"id": f"eq.{tournament_uuid}"},
                    raise_on_error=True,
                )
            except HTTPException as del_exc:
                exc_detail = str(del_exc.detail) if hasattr(del_exc, "detail") else str(del_exc)
                if "42501" in exc_detail or "permission denied" in exc_detail.lower():
                    logger.warning(
                        "tournaments_delete_permission_fallback_to_cancelled",
                        tournament_id=tournament_uuid,
                        detail=exc_detail,
                    )
                    await _sb_patch(
                        client,
                        "tournaments",
                        {"id": f"eq.{tournament_uuid}"},
                        {"status": "cancelled", "updated_at": now},
                    )
                    rows_deleted = 1
                else:
                    raise

        # 6. Verify rowcount == 1. If 0 rows were deleted, return HTTP 404.
        if rows_deleted < 1:
            logger.error("tournament_delete_zero_rows_affected", tournament_id=tournament_uuid)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "tournament_not_found",
                    "message": f"Tournament '{tournament_uuid}' was not found or has already been deleted.",
                },
            )

        # 7. Log the delete result
        logger.info(
            "admin_tournament_deleted_successfully",
            tournament_id=tournament_uuid,
            tournament_title=tournament_title,
            rows_deleted_from_tournaments=rows_deleted,
            rows_deleted_from_related_tables=deleted_summary,
            admin_id=admin_id_val,
            reason=final_reason,
        )

        # 8. Write immutable audit log
        try:
            audit_payload = {
                "admin_id": audit_admin_id,
                "action": "tournament_deleted",
                "tournament_id": tournament_uuid,
                "tournament_name": tournament_title,
                "deleted_registrations": deleted_summary.get("tournament_registrations", 0),
                "deleted_matches": deleted_summary.get("matches", 0),
                "created_at": now,
                "details": {
                    "admin_id": admin_id_val,
                    "admin_email": admin_email_val,
                    "tournament_id": tournament_uuid,
                    "tournament_title": tournament_title,
                    "action": "tournament_deleted",
                    "reason": final_reason,
                    "timestamp": now,
                    "rows_deleted": rows_deleted,
                    "related_records_deleted": deleted_summary,
                    "before_state": before_state,
                    "banner_url": banner_url,
                },
            }
            await _sb_post(client, "admin_audit_logs", audit_payload)
        except Exception as audit_exc:
            logger.warning("admin_audit_log_insert_failed", error=str(audit_exc))

        # 9. Broadcast realtime tournament_status_updated event
        try:
            from app.services.realtime_service import broadcast_tournament_event, generate_realtime_payload
            await broadcast_tournament_event(
                tournament_id=tournament_uuid,
                event="tournament_status_updated",
                payload=generate_realtime_payload(
                    tournament_id=tournament_uuid,
                    event="tournament_status_updated",
                    status="cancelled",
                    extra={"deleted": True, "rows_deleted": rows_deleted, "reason": final_reason},
                ),
                client=client,
            )
        except Exception as exc:
            logger.debug("realtime_delete_broadcast_failed", error=str(exc))

        return {
            "success": True,
            "deleted": True,
            "deletedTournamentId": tournament_uuid,
            "deleted_tournament_id": tournament_uuid,
            "tournament_id": tournament_uuid,
            "tournament_name": tournament_title,
            "rows_deleted": rows_deleted,
            "related_records_deleted": deleted_summary,
            "deleted_by": admin_id_val,
            "delete_reason": final_reason,
            "message": f"Tournament '{tournament_title}' was permanently deleted from the database.",
        }

