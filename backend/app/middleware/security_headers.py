"""Security Headers Middleware for Brackify Arena.

Applies industry-standard HTTP security headers:
- X-Frame-Options: DENY (anti-clickjacking)
- X-Content-Type-Options: nosniff (anti-MIME sniffing)
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy
- Strict-Transport-Security (HSTS)
- Content-Security-Policy (CSP)
"""

from __future__ import annotations

from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # 1. Anti-clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # 2. Anti-MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # 3. Legacy XSS filter
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # 4. Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # 5. Hardware permissions policy
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), payment=(self)"

        # 6. HTTP Strict Transport Security (HSTS) in production
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # 7. Content Security Policy for API responses
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://checkout.razorpay.com; "
            "connect-src 'self' https://*.supabase.co https://api.razorpay.com; "
            "frame-src https://api.razorpay.com https://checkout.razorpay.com; "
            "img-src 'self' data: https: blob:; "
            "font-src 'self' data:; "
            "style-src 'self' 'unsafe-inline';"
        )

        return response

