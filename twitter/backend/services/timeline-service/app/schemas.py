from datetime import datetime

from pydantic import BaseModel


class TweetOut(BaseModel):
    id: int
    user_id: int
    content: str
    parent_tweet_id: int | None
    image_url: str | None
    like_count: int
    reply_count: int
    created_at: datetime


class NotificationCreate(BaseModel):
    type: str
    actor_user_id: int
    tweet_id: int | None = None


class NotificationOut(BaseModel):
    type: str
    actor_user_id: int
    tweet_id: int | None
    created_at: datetime


class NotificationReadRequest(BaseModel):
    read_through: datetime
