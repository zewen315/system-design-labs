from datetime import datetime

from pydantic import BaseModel


class TweetOut(BaseModel):
    id: int
    user_id: int
    content: str
    parent_tweet_id: int | None
    like_count: int
    created_at: datetime
