from datetime import datetime

from pydantic import BaseModel, Field


class TweetCreate(BaseModel):
    user_id: int
    content: str = Field(min_length=1, max_length=280)
    image_url: str | None = None


class TweetUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=280)


class TweetOut(BaseModel):
    id: int
    user_id: int
    content: str
    parent_tweet_id: int | None
    image_url: str | None
    like_count: int
    reply_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ImageUploadRequest(BaseModel):
    content_type: str


class ImageUploadResponse(BaseModel):
    upload_url: str
    image_url: str


class LikeOut(BaseModel):
    tweet_id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
