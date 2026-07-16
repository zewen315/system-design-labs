from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    stream_redis_url: str = "redis://localhost:6379/0"
    timeline_redis_url: str = "redis://localhost:6380/0"
    user_service_url: str = "http://localhost:8001"
    tweet_service_url: str = "http://localhost:8000"

    tweet_events_stream: str = "tweet-events"
    fanout_consumer_group: str = "timeline-fanout"
    fanout_consumer_name: str = "timeline-fanout-worker"
    feed_max_size: int = 800


settings = Settings()
