from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[1]
DEV_SECRET = "dev-only-secret-change-me-in-production-please"


class Settings(BaseSettings):
    """Configuration from environment variables prefixed with BM_ (or a .env file)."""

    model_config = SettingsConfigDict(env_prefix="BM_", env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR / 'var' / 'beautymade.db'}"
    storage_dir: Path = BASE_DIR / "var" / "storage"
    secret_key: str = DEV_SECRET
    access_token_ttl_minutes: int = 60 * 24 * 30
    file_url_ttl_seconds: int = 60 * 60 * 12
    cors_origins: list[str] = ["*"]
    max_upload_mb: int = 15
    worker_threads: int = 2
    # Run reconstruction inside the request (tests, debugging) instead of the worker pool.
    inline_jobs: bool = False

    # AI high-resolution previews. Leave the keys empty to turn the feature off.
    ai_provider: str = ""  # gemini | openai | fake; empty = whichever key is set (Gemini first)
    gemini_api_key: str = ""
    gemini_image_model: str = "gemini-3-pro-image-preview"  # Nano Banana Pro
    openai_api_key: str = ""
    openai_image_model: str = "gpt-image-2"
    ai_timeout_seconds: float = 120
    ai_daily_limit: int = 20  # new images per user per day (cached ones are free)


@lru_cache
def get_settings() -> Settings:
    return Settings()
