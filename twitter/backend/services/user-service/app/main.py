from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import storage
from app.config import settings
from app.database import engine, get_db
from app.models import Base, Follow, User
from app.schemas import (
    AvatarUpdate,
    FollowOut,
    ImageUploadRequest,
    ImageUploadResponse,
    UserCreate,
    UserOut,
    UserWithFollowerCount,
)


def get_active_user(db: Session, user_id: int) -> User | None:
    user = db.get(User, user_id)
    if user is None or user.deactivated_at is not None:
        return None
    return user


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="user-service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/users", response_model=UserOut, status_code=201)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)) -> User:
    user = User(
        username=user_in.username, display_name=user_in.display_name, avatar_url=user_in.avatar_url
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already taken")
    db.refresh(user)

    # Best-effort, same posture as the follow notification/backfill calls
    # elsewhere in this service: users have no outbox of their own (account
    # creation is rare compared to tweets), so this is a direct write to
    # search-service's index rather than an event.
    try:
        httpx.post(
            f"{settings.search_service_url}/users/{user.id}/index",
            json={"username": user.username, "display_name": user.display_name},
            timeout=5.0,
        )
    except httpx.HTTPError:
        pass

    return user


@app.get("/users/all", response_model=list[UserOut])
def list_all_users(db: Session = Depends(get_db)) -> list[User]:
    """Unpaginated full listing for one-off backfills - e.g. reindexing
    search-service after it's introduced, or after its index is rebuilt.
    Not used by any regular user-facing flow (that's what /users/random and
    the bulk /users?ids= lookup are for), which is why there's no limit
    here - fine at this project's demo scale, would need pagination if this
    became a real per-request path.
    """
    stmt = select(User).where(User.deactivated_at.is_(None))
    return list(db.scalars(stmt))


@app.get("/users/by-username/{username}", response_model=UserOut)
def get_user_by_username(username: str, db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None or user.deactivated_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/users/top-followed", response_model=list[UserWithFollowerCount])
def top_followed_users(
    limit: int = Query(default=10, ge=1, le=50), db: Session = Depends(get_db)
) -> list[UserWithFollowerCount]:
    follower_count = func.count(Follow.follower_id).label("follower_count")
    stmt = (
        select(User, follower_count)
        .join(Follow, Follow.followee_id == User.id)
        .where(User.deactivated_at.is_(None))
        .group_by(User.id)
        .order_by(follower_count.desc())
        .limit(limit)
    )
    return [
        UserWithFollowerCount(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            created_at=user.created_at,
            follower_count=count,
        )
        for user, count in db.execute(stmt).all()
    ]


@app.get("/users/random", response_model=list[UserOut])
def random_users(
    limit: int = Query(default=10, ge=1, le=50),
    exclude: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
) -> list[User]:
    stmt = select(User).where(User.deactivated_at.is_(None))
    if exclude:
        stmt = stmt.where(User.id.notin_(exclude))
    stmt = stmt.order_by(func.random()).limit(limit)
    return list(db.scalars(stmt))


@app.get("/users", response_model=list[UserOut])
def list_users_by_ids(
    ids: list[int] = Query(default=[]), db: Session = Depends(get_db)
) -> list[User]:
    """Bulk lookup by id - mirrors tweet-service's GET /tweets?ids=. Used by
    search-service to hydrate ranked user ids from OpenSearch into full
    UserOut objects (avoiding N individual round trips), the same ID-first
    pattern timelines already use.
    """
    if not ids:
        return []
    stmt = select(User).where(User.id.in_(ids), User.deactivated_at.is_(None))
    return list(db.scalars(stmt))


@app.post("/users/avatar-upload-url", response_model=ImageUploadResponse)
def get_avatar_upload_url(body: ImageUploadRequest) -> ImageUploadResponse:
    try:
        upload_url, image_url = storage.presign_upload("avatars", body.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ImageUploadResponse(upload_url=upload_url, image_url=image_url)


@app.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = get_active_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.patch("/users/{user_id}/avatar", response_model=UserOut)
def update_avatar(user_id: int, body: AvatarUpdate, db: Session = Depends(get_db)) -> User:
    user = get_active_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.avatar_url = body.avatar_url
    db.commit()
    db.refresh(user)
    return user


@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)) -> Response:
    user = get_active_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.deactivated_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=204)


@app.post(
    "/users/{follower_id}/following/{followee_id}",
    response_model=FollowOut,
    status_code=201,
)
def follow_user(
    follower_id: int, followee_id: int, db: Session = Depends(get_db)
) -> Follow:
    if follower_id == followee_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    if get_active_user(db, follower_id) is None or get_active_user(db, followee_id) is None:
        raise HTTPException(status_code=404, detail="User not found")

    follow = Follow(follower_id=follower_id, followee_id=followee_id)
    db.add(follow)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already following this user")
    db.refresh(follow)

    # Best-effort: fan-out-on-write never backfills, so without this a fresh
    # follow stays invisible until the followee's next tweet. A backfill
    # failure (timeline-service down, network hiccup) shouldn't fail the
    # follow itself — worst case, it behaves like backfill was never added.
    try:
        httpx.post(
            f"{settings.timeline_service_url}/users/{follower_id}/backfill/{followee_id}",
            timeout=5.0,
        )
    except httpx.HTTPError:
        pass

    # Same best-effort posture as the backfill call above. Follows are far
    # lower-volume than likes/tweets, so a synchronous call here is
    # proportionate — not worth a whole second outbox+relay+stream just for
    # this one event type.
    try:
        httpx.post(
            f"{settings.timeline_service_url}/users/{followee_id}/notifications",
            json={"type": "follow", "actor_user_id": follower_id},
            timeout=5.0,
        )
    except httpx.HTTPError:
        pass

    return follow


@app.delete("/users/{follower_id}/following/{followee_id}", status_code=204)
def unfollow_user(
    follower_id: int, followee_id: int, db: Session = Depends(get_db)
) -> Response:
    follow = db.get(Follow, (follower_id, followee_id))
    if follow is None:
        raise HTTPException(status_code=404, detail="Not following this user")
    db.delete(follow)
    db.commit()
    return Response(status_code=204)


@app.get("/users/{user_id}/followers", response_model=list[UserOut])
def list_followers(user_id: int, db: Session = Depends(get_db)) -> list[User]:
    stmt = (
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.followee_id == user_id, User.deactivated_at.is_(None))
    )
    return list(db.scalars(stmt))


@app.get("/users/{user_id}/following", response_model=list[UserOut])
def list_following(user_id: int, db: Session = Depends(get_db)) -> list[User]:
    stmt = (
        select(User)
        .join(Follow, Follow.followee_id == User.id)
        .where(Follow.follower_id == user_id, User.deactivated_at.is_(None))
    )
    return list(db.scalars(stmt))
