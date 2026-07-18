from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    opensearch_url: str = "http://localhost:9200"

    stream_redis_url: str = "redis://localhost:6379/0"
    tweet_events_stream: str = "tweet-events"
    indexer_consumer_group: str = "search-indexer"
    indexer_consumer_name: str = "search-indexer-worker"

    tweet_service_url: str = "http://localhost:8000"
    user_service_url: str = "http://localhost:8001"


settings = Settings()
