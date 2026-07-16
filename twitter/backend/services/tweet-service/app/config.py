from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/tweets"
    redis_url: str = "redis://localhost:6379/0"
    outbox_stream_name: str = "tweet-events"
    outbox_poll_interval_seconds: float = 1.0
    outbox_batch_size: int = 100


settings = Settings()
