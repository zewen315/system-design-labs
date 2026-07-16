from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models import Base, Follow, User
from app.schemas import FollowOut, UserCreate, UserOut


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
    user = User(username=user_in.username, display_name=user_in.display_name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already taken")
    db.refresh(user)
    return user


@app.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = get_active_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
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
