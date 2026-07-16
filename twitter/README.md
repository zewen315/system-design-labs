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
* GET /tweets/{id}
* PATCH /tweets/{id}
* DELETE /tweets/{id}
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

## Diagram

## Deep Dive

### Schema vs. model separation

Each service keeps two representations of its core entity: a SQLAlchemy model (the DB table) and Pydantic schemas (the API request/response contract). This lets each surface evolve independently — e.g. `TweetCreate` / `TweetUpdate` / `TweetOut` are three different shapes of the same `Tweet` row, each exposing only the fields relevant to that operation, without leaking server-generated fields (`id`, `created_at`) to the client or needing conditional logic to hide them.

### Database-per-service

`tweet-service` and `user-service` each run against their own Postgres instance (`tweet-db`, `user-db`) instead of sharing one. This enforces data ownership at the infrastructure level, not just convention — no service can accidentally query or join across another service's tables. The trade-off: anything that looks like "a user's profile with their tweets" has to be composed via an API call between services, not a SQL join.

### Modeling followers/followees

Following is a directed, self-referential many-to-many relationship between users, modeled with a dedicated `follows` join table (`follower_id`, `followee_id`) rather than a column on `User`. The composite primary key doubles as a uniqueness constraint (can't follow the same person twice), a `CHECK` constraint blocks self-follows, and an extra index on `followee_id` keeps "who follows me" queries fast alongside the PK-backed "who do I follow" queries.

### Constraints as the source of truth

Uniqueness (usernames) and relationship rules (self-follow, duplicate follow) are enforced at the database level via constraints, not only in application code — Pydantic validates shape and format, but only Postgres can atomically guarantee "no two rows with this value" under concurrent requests. Handlers catch the resulting `IntegrityError`, roll back the session, and translate it into the right HTTP status (`409` for conflicts).

### Open question: deleting a user across service boundaries

There's no `DELETE /users/{id}` yet. A hard delete would leave `tweet-service` — a separate database with no foreign key connecting it to `user-service` — holding tweets that reference a `user_id` that no longer exists. Likely direction: prefer a soft delete (`deactivated_at`) over a hard delete, since it sidesteps the cross-service cleanup problem entirely; a true cross-service hard-delete would need an event/message-driven cleanup mechanism, deferred until there's infrastructure (a message queue) to support it.

