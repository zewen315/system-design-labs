# Design Twitter

## Requirements

Functional:
* Create an account and login
* Create, edit, delete tweets
* Follow, unfollow other users
* View a timeline of tweets from following
* Like, reply & retweet
* Search for tweets

Non-functional:
* Scale to 100+ millions of users
* Handle a high volumn of requests
* Highly available 99.999% uptime
* Security & privacy of user data
* Low latency

## Estimation

Read Volumn

Write Volumn

Tweet Size

Takeaways:
* Read-heavy system
* Huge data storage
* Load of popular users, special events

## API Design

tweet-service:
* POST /tweets
* GET /tweets?ids={id}&ids={id}... (batch fetch)
* GET /tweets/{id}
* PATCH /tweets/{id}
* DELETE /tweets/{id}
* POST /tweets/{id}/replies
* GET /tweets/{id}/replies
* POST /tweets/{id}/likes/{user_id}
* DELETE /tweets/{id}/likes/{user_id}
* GET /tweets/{id}/likes
* GET /users/{id}/tweets
* GET /health

user-service:
* POST /users
* GET /users/{id}
* DELETE /users/{id} (soft delete)
* POST /users/{follower_id}/following/{followee_id}
* DELETE /users/{follower_id}/following/{followee_id}
* GET /users/{id}/followers
* GET /users/{id}/following
* GET /health

timeline-service:
* GET /users/{id}/timeline
* GET /health

## Diagram

## Deep Dive

See [TRADEOFFS.md](./TRADEOFFS.md) for the design rationale behind each service — schema/model separation, database-per-service, follower modeling, the transactional outbox, fan-out-on-write, and known gaps left open deliberately.

