from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application
    secret_key: str = "dev-secret-key-change-in-production"
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:8081"]

    # Database
    database_url: str = (
        "postgresql+asyncpg://basketball:basketball@localhost:5432/basketball_clipper"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # AWS
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "basketball-clipper-videos"

    # Anthropic
    anthropic_api_key: str = ""

    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"


settings = Settings()
