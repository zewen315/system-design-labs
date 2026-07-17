from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5433/users"
    timeline_service_url: str = "http://localhost:8002"

    minio_internal_url: str = "http://localhost:9000"
    minio_public_url: str = "http://localhost:8080"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin123"
    minio_bucket: str = "media"


settings = Settings()
