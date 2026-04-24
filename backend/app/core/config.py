import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application
    secret_key: str = "dev-secret-key-change-in-production"
    debug: bool = False
    allowed_origins: str = "http://localhost:3000,http://localhost:8081"

    # Database
    database_url: str = (
        "postgresql+asyncpg://basketball:basketball@localhost:5432/basketball_clipper"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # S3 / MinIO
    s3_endpoint_url: str = ""
    s3_public_url: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "basketball-clipper-videos"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    @property
    def cors_origins(self) -> list[str]:
        v = self.allowed_origins.strip()
        if not v:
            return []
        if v.startswith("["):
            return json.loads(v)
        return [o.strip() for o in v.split(",") if o.strip()]


settings = Settings()
