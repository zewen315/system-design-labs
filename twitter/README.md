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

POST /tweets

GET /tweets/{id}

PATCH /tweets/{id}

DELETE /tweets/{id}

GET /users/{id}/tweets

GET /health

## Diagram

## Timeline

