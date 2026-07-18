import redis

from app.config import settings

# socket_timeout must exceed xreadgroup's block=5000ms, or the client's socket
# read times out before the server's blocking read does.
stream_redis = redis.Redis.from_url(
    settings.stream_redis_url, decode_responses=True, socket_timeout=10
)
