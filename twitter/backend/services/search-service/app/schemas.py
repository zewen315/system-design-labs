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


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None
    created_at: datetime


class UserIndexRequest(BaseModel):
    username: str
    display_name: str
