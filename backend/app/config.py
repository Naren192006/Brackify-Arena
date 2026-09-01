from pydantic import field_validator
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

    # CORS
    cors_origins: str = "http://localhost:3000"

    # OAuth
    frontend_url: str = "http://localhost:3000"
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

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

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
            url = url[len("SUPABASE_URL="):].strip()

        if url and not url.startswith(("http://", "https://")):
            raise ValueError(
                f"SUPABASE_URL must start with 'https://' (got: {url!r}). "
                "Use the project API URL from the Supabase dashboard, e.g. "
                "https://<project-ref>.supabase.co"
            )

        return url

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"


settings = Settings()
