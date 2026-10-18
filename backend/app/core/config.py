from pathlib import Path
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]
MIB = 1024 * 1024
GIB = 1024 * MIB


class Settings(BaseSettings):
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    app_name: str = "Mofan API"
    app_version: str = "2.0.0"
    api_prefix: str = "/api"
    frontend_origin: str = "http://localhost:5173"
    frontend_origins: str | None = None
    session_secret: str = "development-only-change-me"
    session_cookie_name: str = "mofan_session"
    session_days: int = 30
    log_level: str = "INFO"

    # Supabase Postgres. Use the Supabase transaction pooler URL in production.
    database_url: str | None = None
    db_engine: str = "postgresql"
    db_host: str | None = None
    db_port: int = 5432
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None

    # Upstash Redis. Prefer REDIS_URL=rediss://... in Vercel.
    redis_url: str | None = None
    redis_host: str | None = None
    redis_port: int = 6379
    redis_password: str | None = None
    redis_db: int = 0

    # SMTP. Resend works with smtp.resend.com:465, user=resend and the API key as password.
    email_host: str | None = None
    email_port: int = 465
    email_use_ssl: bool = True
    email_host_user: str | None = None
    email_host_password: str | None = None
    default_from_email: str | None = None
    email_code_ttl_seconds: int = 600

    # Attachment storage. Production target is Cloudflare R2 (S3 compatible).
    storage_provider: str = "local"  # local | r2 | s3
    storage_bucket: str | None = None
    storage_endpoint_url: str | None = None
    storage_access_key_id: str | None = None
    storage_secret_access_key: str | None = None
    storage_region: str = "auto"
    storage_presign_ttl_seconds: int = 900
    max_upload_bytes: int = 2 * GIB
    default_user_storage_quota_bytes: int = 20 * MIB
    # Use 9 billion bytes as a conservative application cap below the 10 GB-month free storage band.
    # Set to 0 to disable the global guard (usage above provider free tier may then be billed).
    free_storage_global_cap_bytes: int = 9_000_000_000

    # Stripe has no setup/monthly fee on Standard pricing, but successful payments have transaction fees.
    payments_enabled: bool = False
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_pro_price_id: str | None = None
    stripe_team_price_id: str | None = None
    billing_success_url: str | None = None
    billing_cancel_url: str | None = None

    # Site admin access and manual storage-expansion payment instructions.
    site_admin_emails: str = ""
    storage_payment_instructions: str = "提交申请后，请按管理员提供的方式完成付款，并在页面点击“我已付款”。"

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.database_url:
            value = self.database_url.strip()
            if value.startswith("postgres://"):
                value = "postgresql://" + value[len("postgres://") :]
            if value.startswith("postgresql://") and "+" not in value.split("://", 1)[0]:
                value = "postgresql+psycopg://" + value[len("postgresql://") :]
            return value

        if not all([self.db_host, self.db_name, self.db_user, self.db_password]):
            raise ValueError("DATABASE_URL is required (Supabase Postgres transaction-pooler URL)")
        user = quote_plus(self.db_user or "")
        password = quote_plus(self.db_password or "")
        return (
            f"postgresql+psycopg://{user}:{password}@{self.db_host}:{self.db_port}/"
            f"{self.db_name}?sslmode=require"
        )

    @property
    def resolved_redis_url(self) -> str:
        if self.redis_url:
            return self.redis_url
        if not self.redis_host:
            raise ValueError("REDIS_URL is required")
        password = f":{quote_plus(self.redis_password)}@" if self.redis_password else ""
        return f"redis://{password}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def cookie_secure(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        raw = self.frontend_origins or self.frontend_origin
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def storage_is_remote(self) -> bool:
        return self.storage_provider.lower() in {"r2", "s3"}

    @property
    def site_admin_email_set(self) -> set[str]:
        return {item.strip().lower() for item in self.site_admin_emails.split(",") if item.strip()}


settings = Settings()
