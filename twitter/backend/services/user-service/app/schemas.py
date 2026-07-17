from datetime import datetime

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserWithFollowerCount(UserOut):
    follower_count: int


class FollowOut(BaseModel):
    follower_id: int
    followee_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AvatarUpdate(BaseModel):
    avatar_url: str


class ImageUploadRequest(BaseModel):
    content_type: str


class ImageUploadResponse(BaseModel):
    upload_url: str
    image_url: str
