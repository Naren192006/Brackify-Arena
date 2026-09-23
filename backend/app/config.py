from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_name: str = "Brackify Arena"
    environment: str = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://tournament:tournament@localhost:5432/tournament"
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = True

    # Security
    secret_key: str = "dev-secret-change-in-production-min-32-chars!!"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"

    # CORS & Trusted Hosts
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,https://brackify-arena-self.vercel.app,https://brackify-arena.vercel.app"
    allowed_hosts: str = "*"

    # Error monitoring (Sentry) — inactive until SENTRY_DSN is set
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

    # OAuth
    frontend_url: str = "https://brackify-arena-self.vercel.app"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Razorpay (server-side only — never expose key_secret to browser)
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # Supabase service-role (server-side only — bypasses RLS for payment writes)
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""

    # Platform Admin Authentication (Isolated System)
    admin_jwt_secret: str = ""
    admin_cookie_name: str = "admin_session"
    admin_session_expire_hours: int = 24
    admin_csrf_cookie_name: str = "admin_csrf"

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("debug", mode="before")
    @classmethod
    def _normalize_debug(cls, v: object) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in ("true", "1", "yes", "on", "dev", "development")
        return bool(v)

    @field_validator("supabase_url", mode="before")
    @classmethod
    def _normalize_supabase_url(cls, v: object) -> object:
        """Strip trailing slashes and reject obviously wrong values.

        Guards against common paste mistakes such as:
          • SUPABASE_URL=SUPABASE_URL=https://...   (key name duplicated)
          • SUPABASE_URL=https://supabase.com/dashboard/project/...
        """
        if not isinstance(v, str) or v == "":
            return v  # empty string handled later by payment_service

        url = v.strip().rstrip("/")

        # Strip accidental "SUPABASE_URL=" prefix if the value was pasted wrong
        if url.upper().startswith("SUPABASE_URL="):
            url = url[len("SUPABASE_URL=") :].strip()

        if url and not url.startswith(("http://", "https://")):
            raise ValueError(
                f"SUPABASE_URL must start with 'https://' (got: {url!r}). "
                "Use the project API URL from the Supabase dashboard, e.g. "
                "https://<project-ref>.supabase.co"
            )

        return url

    @model_validator(mode="after")
    def _validate_production_settings(self) -> "Settings":
        """Validate critical security settings when running in production."""
        if self.is_production:
            if self.secret_key == "dev-secret-change-in-production-min-32-chars!!":
                raise ValueError(
                    "SECRET_KEY must be changed from the development placeholder in production."
                )
            if len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY must be at least 32 characters in production.")
            if self.razorpay_key_id:
                if not self.razorpay_key_id.startswith("rzp_live_"):
                    prefix = self.razorpay_key_id[:8]
                    raise ValueError(
                        f"In production, RAZORPAY_KEY_ID must be a live key starting "
                        f"with 'rzp_live_' (got: {prefix}...)"
                    )
                if not self.razorpay_key_secret:
                    raise ValueError(
                        "RAZORPAY_KEY_SECRET is required when payments are enabled in production."
                    )
                if not self.razorpay_webhook_secret:
                    raise ValueError(
                        "RAZORPAY_WEBHOOK_SECRET is required for payment webhook "
                        "verification in production."
                    )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"


settings = Settings()
