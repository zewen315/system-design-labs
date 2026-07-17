from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/tweets"
    redis_url: str = "redis://localhost:6379/0"
    outbox_stream_name: str = "tweet-events"
    outbox_poll_interval_seconds: float = 1.0
    outbox_batch_size: int = 100

    minio_internal_url: str = "http://localhost:9000"
    minio_public_url: str = "http://localhost:8080"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin123"
    minio_bucket: str = "media"


settings = Settings()
