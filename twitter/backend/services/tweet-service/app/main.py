from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models import Base, Like, Tweet
from app.schemas import LikeOut, TweetCreate, TweetOut, TweetUpdate


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="tweet-service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/tweets", response_model=TweetOut, status_code=201)
def create_tweet(tweet_in: TweetCreate, db: Session = Depends(get_db)) -> Tweet:
    tweet = Tweet(user_id=tweet_in.user_id, content=tweet_in.content)
    db.add(tweet)
    db.commit()
    db.refresh(tweet)
    return tweet


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
    )
    db.add(reply)
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
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Tweet already liked")
    db.refresh(like)
    return like


@app.delete("/tweets/{tweet_id}/likes/{user_id}", status_code=204)
def unlike_tweet(tweet_id: int, user_id: int, db: Session = Depends(get_db)) -> Response:
    like = db.get(Like, (tweet_id, user_id))
    if like is None:
        raise HTTPException(status_code=404, detail="Like not found")
    db.delete(like)
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
        .where(Tweet.user_id == user_id)
        .order_by(Tweet.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))
