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

### Deleting a user is a soft delete

`DELETE /users/{id}` sets a `deactivated_at` timestamp instead of removing the row. A hard delete would leave `tweet-service` — a separate database with no foreign key connecting it to `user-service` — holding tweets that reference a `user_id` that no longer exists, with no built-in way to know. Soft delete sidesteps that entirely: the row still exists, so nothing anywhere orphans; `user-service` just treats a deactivated user as "not found" everywhere it's looked up (`GET`, follow targets, followers/following lists). A true cross-service hard-delete would need an event/message-driven cleanup mechanism, deferred until there's infrastructure (a message queue) to support it.

### Replies live inside tweet-service, not a separate service

A reply has the exact same shape as a tweet — `user_id` + `content` + `created_at` — plus one extra pointer to what it's replying to. Rather than standing up a separate `reply-service` with its own copy of that content (which would mean the same kind of data owned by two services, the anti-pattern flagged for `follows`), `Tweet` just gained a nullable, self-referential `parent_tweet_id` (`tweets.id -> tweets.id`). `NULL` means top-level tweet; a value means it's a reply. `POST /tweets/{id}/replies` and `GET /tweets/{id}/replies` reuse the existing `Tweet` model and `TweetCreate` schema entirely — no new tables. The original `reply-service` folder stub is now unused as a result.

### Likes span two services without a foreign key

A like connects a `Tweet` (owned by `tweet-service`) to a `User` (owned by `user-service`) — two different databases, so there's no way to have a real foreign key on both sides. This isn't a new problem: `Tweet.user_id` was already an unenforced cross-service reference from the start. `likes` follows the same rule — `tweet_id` gets a real FK (same database as `Tweet`), `user_id` stays a plain, unvalidated int. The table itself mirrors `follows`: composite primary key `(tweet_id, user_id)` blocks double-likes structurally, and a separate index on `user_id` supports the reverse lookup ("tweets this user liked"). Deliberately deferred: a denormalized `like_count` on `TweetOut` would avoid computing counts live, but introduces its own write-complexity and drift risk — a separate decision for later.

### Timeline: fan-out-on-write, and why it needs a transactional outbox

`timeline-service` uses fan-out-on-write (push), not fan-out-on-read (pull): when a tweet is created, it's proactively copied into every follower's precomputed feed, so reading a timeline is cheap (read your own feed) at the cost of expensive, asynchronous writes on every tweet. This is the classic Twitter-scale trade-off, chosen deliberately over pull specifically to practice message-queue-driven fan-out — pull would have meant no queue at all, just live API composition between `tweet-service` and `user-service`.

The queue is **Redis Streams**, not Kafka — chosen for weight, not capability. Redis Streams still gives the concepts that matter here (an append-only log per stream, consumer groups, per-message acknowledgment, replay-by-offset) in a single lightweight container with near-zero config, versus a JVM broker whose complexity (partitioning, replication, rebalancing) is aimed at a scale this lab will never hit.

Publishing an event is not free of race conditions, though: `tweet-service` has to both commit the tweet to Postgres *and* publish a "tweet created" event to Redis. Those are two different systems with no shared transaction — if the process crashes between them, the tweet exists but the event never fires, and it silently never reaches anyone's timeline. Publishing-right-after-commit was the "known gap" called out when fan-out was first scoped; building fan-out-on-write for real means closing it.

The fix is the **transactional outbox pattern**:

* `tweet-service`'s own database gains an `outbox` table: `id`, `event_type` (`"tweet_created"`, room for more later), `payload` (JSONB — `tweet_id`, `user_id`, `content`, `created_at`), `created_at`, `published_at` (`NULL` until relayed).
* Creating a tweet writes the `Tweet` row *and* the matching `outbox` row in the **same Postgres transaction**. Since both commit together atomically, "the tweet exists" and "an event describing it exists" become the same fact — there's no window where one exists without the other.
* A separate **relay process** — same codebase/image as `tweet-service`, different entrypoint, not part of the API — polls `outbox WHERE published_at IS NULL`, publishes each row's payload to the Redis Stream, and marks it published. It claims rows with `SELECT ... FOR UPDATE SKIP LOCKED`, so multiple relay replicas can run concurrently without double-publishing or blocking on each other.
* This yields **at-least-once delivery, not exactly-once**: if the relay publishes to Redis but crashes before committing `published_at`, the same event republishes on restart. Whatever consumes these events downstream (the fan-out worker that writes into follower feeds) has to treat re-processing the same `tweet_id` as safe — e.g. adding to a Redis sorted set is naturally idempotent, since re-adding an existing member just updates its score instead of duplicating it.

The Redis container backing the queue is named `stream-redis`, not just `redis` — deliberately, because it's expected to stay a *single-purpose* container. When `timeline-service` is built, its precomputed per-user feeds will most naturally live in Redis Sorted Sets (tweet IDs scored by timestamp, so a feed is always ranked and cheap to paginate) — a different Redis data structure than the Stream, but nothing stops it from technically living in the same container. It shouldn't: the Stream is legitimately shared infrastructure (a queue connects a producer and a consumer by definition), but a precomputed feed is `timeline-service`'s own private data, the same category of thing `tweet-db`/`user-db` already taught us to keep separate per service. Plan is a second container, `timeline-redis`, once that's built — `stream-redis` stays the queue only.

