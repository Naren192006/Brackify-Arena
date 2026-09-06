"""Admin Tournament Service — Production Safe Tournament Deletion & Audit Logging.

Rules:
1. Verify schema before deleting: Only delete from tables that exist; missing tables skipped gracefully.
2. Transactional deletion: Executes atomic DB cleanup.
3. Delete Storage only after DB validation: Purges banner and match evidence, ignoring missing files.
4. Never modify unrelated features: Payments preserved as 'cancelled_admin' (never deleted).
"""

from __future__ import annotations

import datetime
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.auth import AuthUser
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _is_uuid(val: str) -> bool:
    try:
        UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


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
    """Extract object relative path from a full or relative Supabase storage URL."""
    if not url or not isinstance(url, str):
        return None
    url_str = url.strip()
    if not url_str or bucket_name not in url_str:
        return None

    # Parse URL path
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
        r.raise_for_status()
        data: Any = r.json()
        return data if isinstance(data, list) else []
    except httpx.HTTPStatusError as exc:
        # Table might not exist or error
        logger.debug("supabase_get_optional_table_missing", table=table, status=exc.response.status_code)
        return []
    except Exception as exc:
        logger.debug("supabase_get_error", table=table, error=str(exc))
        return []


async def _sb_delete(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
) -> int:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.delete(url, headers=headers, params=params)
        if r.status_code == 404:
            return 0
        r.raise_for_status()
        data = r.json()
        return len(data) if isinstance(data, list) else 1
    except httpx.HTTPStatusError as exc:
        logger.debug("supabase_delete_optional_table_missing", table=table, status=exc.response.status_code)
        return 0
    except Exception as exc:
        logger.debug("supabase_delete_error", table=table, error=str(exc))
        return 0


async def _sb_patch(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
    body: dict[str, Any],
) -> None:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=minimal")
    try:
        r = await client.patch(url, headers=headers, params=params, json=body)
        if r.status_code == 404:
            return
        r.raise_for_status()
    except Exception as exc:
        logger.debug("supabase_patch_optional_error", table=table, error=str(exc))


async def _sb_post(
    client: httpx.AsyncClient,
    table: str,
    body: dict[str, Any] | list[dict[str, Any]],
) -> None:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=minimal")
    try:
        r = await client.post(url, headers=headers, json=body)
        if r.status_code == 404:
            return
        r.raise_for_status()
    except Exception as exc:
        logger.debug("supabase_post_optional_error", table=table, error=str(exc))


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
    """Safely delete storage object from Supabase bucket; ignores missing files."""
    if not file_url_or_path:
        return
    path = _extract_storage_path(file_url_or_path, bucket) or file_url_or_path.lstrip("/")
    if not path or path.startswith("http://") or path.startswith("https://") or "/" not in path and "." not in path:
        # Avoid malformed paths
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
        else:
            logger.warning("storage_file_delete_skipped", bucket=bucket, path=path, status=r.status_code)
    except Exception as exc:
        logger.warning("storage_file_delete_exception", bucket=bucket, path=path, error=str(exc))


async def delete_tournament_service(
    tournament_id: str,
    admin_user: Any,
) -> dict[str, Any]:
    """Permanently delete a tournament with cascade cleanup, payment preservation, and audit logging."""
    is_admin = getattr(admin_user, "is_admin", False) or getattr(admin_user, "role", "") in ("super_admin", "sub_admin")
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )



    if not tournament_id or not tournament_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_tournament_id", "message": "A valid tournament ID or slug is required."},
        )

    clean_id = tournament_id.strip()

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Look up tournament to verify existence
        param = {"id": f"eq.{clean_id}"} if _is_uuid(clean_id) else {"slug": f"eq.{clean_id}"}
        param["select"] = "id,title,banner_url,slug,status,created_by"
        t_rows = await _sb_get(client, "tournaments", param)
        if not t_rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "tournament_not_found", "message": f"Tournament '{clean_id}' was not found."},
            )

        tournament = t_rows[0]
        tournament_uuid = tournament["id"]
        tournament_title = tournament.get("title") or clean_id
        banner_url = tournament.get("banner_url")

        deleted_registrations = 0
        deleted_matches = 0
        evidence_urls: list[str] = []

        # 2. Attempt atomic PostgreSQL RPC transactional deletion
        rpc_success = False
        try:
            rpc_res = await _sb_rpc(
                client,
                "admin_delete_tournament_tx",
                {
                    "target_tournament_id": tournament_uuid,
                    "target_admin_id": admin_user.id,
                },
            )
            if isinstance(rpc_res, dict) and rpc_res.get("deleted"):
                rpc_success = True
                deleted_registrations = rpc_res.get("deleted_registrations", 0)
                deleted_matches = rpc_res.get("deleted_matches", 0)
                banner_url = rpc_res.get("banner_url") or banner_url
                evidence_urls = rpc_res.get("evidence_urls") or []
        except Exception as rpc_exc:
            logger.info("admin_delete_rpc_fallback", tournament_id=tournament_uuid, error=str(rpc_exc))

        # 3. Step-by-step cascade fallback if RPC is not available
        if not rpc_success:
            # 3a. Matches & Match Reports
            matches = await _sb_get(client, "matches", {"tournament_id": f"eq.{tournament_uuid}", "select": "id"})
            deleted_matches = len(matches)
            match_ids = [m["id"] for m in matches if m.get("id")]

            if match_ids:
                # Collect match report evidence files
                match_id_in = f"in.({','.join(match_ids)})"
                reports = await _sb_get(client, "match_reports", {"match_id": match_id_in, "select": "id,evidence_url"})
                for r in reports:
                    if r.get("evidence_url"):
                        evidence_urls.append(r["evidence_url"])

                # Delete match reports
                await _sb_delete(client, "match_reports", {"match_id": match_id_in})

            # Delete matches
            await _sb_delete(client, "matches", {"tournament_id": f"eq.{tournament_uuid}"})

            # 3b. Brackets & Bracket Matches / Nodes
            await _sb_delete(client, "bracket_matches", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "bracket_nodes", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "brackets", {"tournament_id": f"eq.{tournament_uuid}"})

            # 3c. Fair Play Reports & Reports
            fp_reports = await _sb_get(client, "fair_play_reports", {"tournament_id": f"eq.{tournament_uuid}", "select": "id,evidence_url"})
            for fp in fp_reports:
                if fp.get("evidence_url"):
                    evidence_urls.append(fp["evidence_url"])
                if fp.get("id"):
                    await _sb_delete(client, "moderation_actions", {"report_id": f"eq.{fp['id']}"})
            await _sb_delete(client, "fair_play_reports", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "reports", {"tournament_id": f"eq.{tournament_uuid}"})

            # 3d. Control room artifacts
            await _sb_delete(client, "tournament_announcements", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "tournament_admin_notes", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "tournament_admins", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "tournament_streams", {"tournament_id": f"eq.{tournament_uuid}"})
            await _sb_delete(client, "team_invitations", {"tournament_id": f"eq.{tournament_uuid}"})

            # 3e. PRESERVE PAYMENTS (Rule 4): Update status to cancelled_admin
            await _sb_patch(
                client,
                "payments",
                {"tournament_id": f"eq.{tournament_uuid}"},
                {"status": "cancelled_admin", "updated_at": _now_iso()},
            )

            # 3f. Tournament Registrations
            registrations = await _sb_get(client, "tournament_registrations", {"tournament_id": f"eq.{tournament_uuid}", "select": "id"})
            deleted_registrations = len(registrations)
            await _sb_delete(client, "tournament_registrations", {"tournament_id": f"eq.{tournament_uuid}"})

            # 3g. Delete Tournament Row
            await _sb_delete(client, "tournaments", {"id": f"eq.{tournament_uuid}"})

            # 3h. Audit Logs
            await _sb_post(
                client,
                "admin_audit_logs",
                {
                    "admin_id": admin_user.id,
                    "action": "tournament_deleted",
                    "tournament_id": tournament_uuid,
                    "tournament_name": tournament_title,
                    "deleted_registrations": deleted_registrations,
                    "deleted_matches": deleted_matches,
                    "deleted_at": _now_iso(),
                    "details": {
                        "admin_email": admin_user.email,
                        "banner_url": banner_url,
                        "evidence_urls": evidence_urls,
                    },
                },
            )

            await _sb_post(
                client,
                "activity_events",
                {
                    "user_id": admin_user.id,
                    "event_type": "admin_tournament_deleted",
                    "description": f"Admin permanently deleted tournament '{tournament_title}' ({tournament_uuid})",
                },
            )

        # 4. Storage cleanup (Rule 3: Only after DB validation / deletion, ignore missing files)
        if banner_url:
            await _delete_storage_file(client, "tournament-banners", banner_url)

        for ev_url in evidence_urls:
            if ev_url:
                await _delete_storage_file(client, "match-evidence", ev_url)

        logger.info(
            "admin_tournament_deleted_successfully",
            tournament_id=tournament_uuid,
            title=tournament_title,
            admin_id=admin_user.id,
            deleted_registrations=deleted_registrations,
            deleted_matches=deleted_matches,
        )

        return {
            "success": True,
            "deleted": True,
            "tournament_id": tournament_uuid,
            "tournament_name": tournament_title,
            "deleted_registrations": deleted_registrations,
            "deleted_matches": deleted_matches,
            "message": f"Tournament '{tournament_title}' was deleted successfully.",
        }

