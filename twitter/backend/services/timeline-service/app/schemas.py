from datetime import datetime

from pydantic import BaseModel


class TweetOut(BaseModel):
    id: int
    user_id: int
    content: str
    parent_tweet_id: int | None
    created_at: datetime
