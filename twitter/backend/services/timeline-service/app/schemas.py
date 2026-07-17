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
