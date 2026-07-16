from datetime import datetime

from pydantic import BaseModel, Field


class TweetCreate(BaseModel):
    user_id: int
    content: str = Field(min_length=1, max_length=280)


class TweetUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=280)


class TweetOut(BaseModel):
    id: int
    user_id: int
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
