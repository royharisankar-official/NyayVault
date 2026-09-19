import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings(BaseModel):
    SECRET_KEY: str = os.getenv("SECRET_KEY", "prototype-only-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./dms.db"
    )
    HF_TOKEN: str | None = os.getenv("HF_TOKEN")
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    BASE_DIR: Path = BASE_DIR

    # File storage
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    MEDIA_DIR: Path = BASE_DIR / "media"
    MAX_UPLOAD_SIZE: int = 25 * 1024 * 1024

    model_config = {"env_nested_delimiter": "__"}

# Settings instance
settings = Settings()

BASE_DIR = settings.BASE_DIR
UPLOAD_DIR = settings.UPLOAD_DIR
MEDIA_DIR = settings.MEDIA_DIR