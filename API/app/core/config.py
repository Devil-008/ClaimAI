import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST: str = "72.61.226.68"
    DB_PORT: int = 3306
    DB_NAME: str = "claims_automation_db"
    DB_USER: str = "aiinhome"
    DB_PASSWORD: str = "Aiin@2026"
    SECRET_KEY: str = "change_me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    APP_ENV: str = "development"

    # ArangoDB Settings
    ARANGO_URL: str = "http://127.0.0.1:8529"
    ARANGO_DB_NAME: str = "claims_kg"
    ARANGO_USER: str = "root"
    ARANGO_PASSWORD: str = ""

    # Mistral Settings
    MISTRAL_API_KEY: str = ""

    # SMTP escalation mail settings
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "himanshumahata355@gmail.com"
    SMTP_PASSWORD: str = "jxsvqcchqhlwninp"
    SMTP_FROM: str = "ClaimAI <himanshumahata355@gmail.com>"
    SMTP_USE_TLS: bool = True
    ESCALATION_MAINTENANCE_MINUTES: int = 1
    ESCALATION_CHECK_INTERVAL_SECONDS: int = 15

    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
        extra = "ignore"

settings = Settings()
