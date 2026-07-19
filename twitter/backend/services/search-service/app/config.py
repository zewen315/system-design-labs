from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    typesense_host: str = "localhost"
    typesense_port: str = "8108"
    typesense_protocol: str = "http"
    typesense_api_key: str = "xyz"

    stream_redis_url: str = "redis://localhost:6379/0"
    tweet_events_stream: str = "tweet-events"
    indexer_consumer_group: str = "search-indexer"
    indexer_consumer_name: str = "search-indexer-worker"

    tweet_service_url: str = "http://localhost:8000"
    user_service_url: str = "http://localhost:8001"


settings = Settings()
