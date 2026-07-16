from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models import Base, Tweet
from app.schemas import TweetCreate, TweetOut, TweetUpdate


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
