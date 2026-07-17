from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import storage
from app.database import engine, get_db
from app.models import Base, Like, OutboxEvent, Tweet
from app.schemas import (
    ImageUploadRequest,
    ImageUploadResponse,
    LikeOut,
    TweetCreate,
    TweetOut,
    TweetUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="tweet-service", lifespan=lifespan)


def _enqueue_tweet_created(db: Session, tweet: Tweet) -> None:
    """Write the outbox row in the same transaction as the tweet itself."""
    db.add(
        OutboxEvent(
            event_type="tweet_created",
            payload={
                "tweet_id": tweet.id,
                "user_id": tweet.user_id,
                "content": tweet.content,
                "parent_tweet_id": tweet.parent_tweet_id,
                "created_at": tweet.created_at.isoformat(),
            },
        )
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/tweets/image-upload-url", response_model=ImageUploadResponse)
def get_tweet_image_upload_url(body: ImageUploadRequest) -> ImageUploadResponse:
    try:
        upload_url, image_url = storage.presign_upload("tweets", body.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ImageUploadResponse(upload_url=upload_url, image_url=image_url)


@app.post("/tweets", response_model=TweetOut, status_code=201)
def create_tweet(tweet_in: TweetCreate, db: Session = Depends(get_db)) -> Tweet:
    tweet = Tweet(user_id=tweet_in.user_id, content=tweet_in.content, image_url=tweet_in.image_url)
    db.add(tweet)
    db.flush()
    _enqueue_tweet_created(db, tweet)
    db.commit()
    db.refresh(tweet)
    return tweet


@app.get("/tweets", response_model=list[TweetOut])
def list_tweets_by_ids(
    ids: list[int] = Query(default=[]), db: Session = Depends(get_db)
) -> list[Tweet]:
    if not ids:
        return []
    stmt = select(Tweet).where(Tweet.id.in_(ids))
    return list(db.scalars(stmt))


@app.get("/tweets/random", response_model=list[TweetOut])
def random_tweets(
    limit: int = Query(default=20, ge=1, le=100),
    exclude_user_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
) -> list[Tweet]:
    stmt = select(Tweet).where(Tweet.parent_tweet_id.is_(None))
    if exclude_user_ids:
        stmt = stmt.where(Tweet.user_id.notin_(exclude_user_ids))
    stmt = stmt.order_by(func.random()).limit(limit)
    return list(db.scalars(stmt))


@app.get("/tweets/{tweet_id}", response_model=TweetOut)
def get_tweet(tweet_id: int, db: Session = Depends(get_db)) -> Tweet:
    tweet = db.get(Tweet, tweet_id)
    if tweet is None:
        raise HTTPException(status_code=404, detail="Tweet not found")
    return tweet


@app.patch("/tweets/{tweet_id}", response_model=TweetOut)
def update_tweet(
    tweet_id: int, tweet_in: TweetUpdate, db: Session = Depends(get_db)
) -> Tweet:
    tweet = db.get(Tweet, tweet_id)
    if tweet is None:
        raise HTTPException(status_code=404, detail="Tweet not found")
    tweet.content = tweet_in.content
    db.commit()
    db.refresh(tweet)
    return tweet


@app.delete("/tweets/{tweet_id}", status_code=204)
def delete_tweet(tweet_id: int, db: Session = Depends(get_db)) -> Response:
    tweet = db.get(Tweet, tweet_id)
    if tweet is None:
        raise HTTPException(status_code=404, detail="Tweet not found")
    db.delete(tweet)
    db.commit()
    return Response(status_code=204)


@app.post("/tweets/{tweet_id}/replies", response_model=TweetOut, status_code=201)
def create_reply(
    tweet_id: int, reply_in: TweetCreate, db: Session = Depends(get_db)
) -> Tweet:
    if db.get(Tweet, tweet_id) is None:
        raise HTTPException(status_code=404, detail="Tweet not found")
    reply = Tweet(
        user_id=reply_in.user_id,
        content=reply_in.content,
        parent_tweet_id=tweet_id,
        image_url=reply_in.image_url,
    )
    db.add(reply)
    db.flush()
    _enqueue_tweet_created(db, reply)
    db.execute(
        update(Tweet).where(Tweet.id == tweet_id).values(reply_count=Tweet.reply_count + 1)
    )
    db.commit()
    db.refresh(reply)
    return reply


@app.get("/tweets/{tweet_id}/replies", response_model=list[TweetOut])
def list_replies(
    tweet_id: int,
    limit: int = Query(default=5, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Tweet]:
    stmt = (
        select(Tweet)
        .where(Tweet.parent_tweet_id == tweet_id)
        .order_by(Tweet.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


@app.post("/tweets/{tweet_id}/likes/{user_id}", response_model=LikeOut, status_code=201)
def like_tweet(tweet_id: int, user_id: int, db: Session = Depends(get_db)) -> Like:
    if db.get(Tweet, tweet_id) is None:
        raise HTTPException(status_code=404, detail="Tweet not found")

    like = Like(tweet_id=tweet_id, user_id=user_id)
    db.add(like)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Tweet already liked")

    db.execute(
        update(Tweet).where(Tweet.id == tweet_id).values(like_count=Tweet.like_count + 1)
    )
    db.commit()
    db.refresh(like)
    return like


@app.delete("/tweets/{tweet_id}/likes/{user_id}", status_code=204)
def unlike_tweet(tweet_id: int, user_id: int, db: Session = Depends(get_db)) -> Response:
    like = db.get(Like, (tweet_id, user_id))
    if like is None:
        raise HTTPException(status_code=404, detail="Like not found")
    db.delete(like)
    db.execute(
        update(Tweet).where(Tweet.id == tweet_id).values(like_count=Tweet.like_count - 1)
    )
    db.commit()
    return Response(status_code=204)


@app.get("/tweets/{tweet_id}/likes", response_model=list[LikeOut])
def list_likes(tweet_id: int, db: Session = Depends(get_db)) -> list[Like]:
    stmt = select(Like).where(Like.tweet_id == tweet_id)
    return list(db.scalars(stmt))


@app.get("/users/{user_id}/tweets", response_model=list[TweetOut])
def list_user_tweets(
    user_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Tweet]:
    stmt = (
        select(Tweet)
        .where(Tweet.user_id == user_id, Tweet.parent_tweet_id.is_(None))
        .order_by(Tweet.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


@app.get("/users/{user_id}/replies", response_model=list[TweetOut])
def list_user_replies(
    user_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Tweet]:
    stmt = (
        select(Tweet)
        .where(Tweet.user_id == user_id, Tweet.parent_tweet_id.is_not(None))
        .order_by(Tweet.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


@app.get("/users/{user_id}/likes", response_model=list[TweetOut])
def list_user_likes(
    user_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Tweet]:
    stmt = (
        select(Tweet)
        .join(Like, Like.tweet_id == Tweet.id)
        .where(Like.user_id == user_id)
        .order_by(Like.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))
