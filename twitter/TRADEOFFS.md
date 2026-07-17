# Design Tradeoffs

Deep-dive rationale behind the decisions in [README.md](./README.md) — why each piece is shaped the way it is, what alternatives were rejected, and what gaps are left deliberately open.

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

A like connects a `Tweet` (owned by `tweet-service`) to a `User` (owned by `user-service`) — two different databases, so there's no way to have a real foreign key on both sides. This isn't a new problem: `Tweet.user_id` was already an unenforced cross-service reference from the start. `likes` follows the same rule — `tweet_id` gets a real FK (same database as `Tweet`), `user_id` stays a plain, unvalidated int. The table itself mirrors `follows`: composite primary key `(tweet_id, user_id)` blocks double-likes structurally, and a separate index on `user_id` supports the reverse lookup ("tweets this user liked").

### Denormalized like_count, and why it's safe here specifically

Counting `likes` live (`COUNT(*) WHERE tweet_id = ?`) is index-backed (the composite PK's leading column is `tweet_id`), so it isn't naive — but it's still `O(matching rows)`, not `O(1)`, and `timeline-service` rendering a page of 20 tweets would multiply that cost by 20 per request. `Tweet` gained a denormalized `like_count` column, kept in sync inside the *same transaction* as every like/unlike write.

This is a safer version of "just add a counter" than the general case, for a reason specific to this architecture: `Like` and `Tweet` live in the same Postgres database, owned by the same service, so the write to `likes` and the write to `like_count` can be part of one atomic transaction — there's no cross-service drift risk to design around here, unlike the `tweet-events` outbox (where the two things genuinely live in different systems and needed the outbox pattern to stay consistent).

The increment itself has to be a database-level atomic expression, not a Python read-modify-write:

```python
# WRONG — read and write are separate round trips; a concurrent like can land
# in between them and get silently overwritten (a "lost update")
tweet.like_count += 1

# RIGHT — Postgres locks the row and evaluates the expression against the
# current committed value as one indivisible operation
db.execute(update(Tweet).where(Tweet.id == tweet_id).values(like_count=Tweet.like_count + 1))
```

`like_tweet`'s duplicate-check was changed from `db.commit()` to `db.flush()` to make this possible: `flush()` still sends the pending `INSERT` to Postgres and still raises `IntegrityError` on a duplicate `(tweet_id, user_id)`, but it doesn't end the transaction — so the `Like` insert and the `like_count` update commit together as one atomic unit, rather than as two separate transactions that could drift apart if a crash landed between them.

### Timeline: fan-out-on-write, and why it needs a transactional outbox

`timeline-service` uses fan-out-on-write (push), not fan-out-on-read (pull): when a tweet is created, it's proactively copied into every follower's precomputed feed, so reading a timeline is cheap (read your own feed) at the cost of expensive, asynchronous writes on every tweet. This is the classic Twitter-scale trade-off, chosen deliberately over pull specifically to practice message-queue-driven fan-out — pull would have meant no queue at all, just live API composition between `tweet-service` and `user-service`.

The queue is **Redis Streams**, not Kafka — chosen for weight, not capability. Redis Streams still gives the concepts that matter here (an append-only log per stream, consumer groups, per-message acknowledgment, replay-by-offset) in a single lightweight container with near-zero config, versus a JVM broker whose complexity (partitioning, replication, rebalancing) is aimed at a scale this lab will never hit.

Publishing an event is not free of race conditions, though: `tweet-service` has to both commit the tweet to Postgres *and* publish a "tweet created" event to Redis. Those are two different systems with no shared transaction — if the process crashes between them, the tweet exists but the event never fires, and it silently never reaches anyone's timeline. Publishing-right-after-commit was the "known gap" called out when fan-out was first scoped; building fan-out-on-write for real means closing it.

The fix is the **transactional outbox pattern**:

* `tweet-service`'s own database gains an `outbox` table: `id`, `event_type` (`"tweet_created"`, room for more later), `payload` (JSONB — `tweet_id`, `user_id`, `content`, `created_at`), `created_at`, `published_at` (`NULL` until relayed).
* Creating a tweet writes the `Tweet` row *and* the matching `outbox` row in the **same Postgres transaction**. Since both commit together atomically, "the tweet exists" and "an event describing it exists" become the same fact — there's no window where one exists without the other.
* A separate **relay process** — same codebase/image as `tweet-service`, different entrypoint, not part of the API — polls `outbox WHERE published_at IS NULL`, publishes each row's payload to the Redis Stream, and marks it published. It claims rows with `SELECT ... FOR UPDATE SKIP LOCKED`, so multiple relay replicas can run concurrently without double-publishing or blocking on each other.
* This yields **at-least-once delivery, not exactly-once**: if the relay publishes to Redis but crashes before committing `published_at`, the same event republishes on restart. Whatever consumes these events downstream (the fan-out worker that writes into follower feeds) has to treat re-processing the same `tweet_id` as safe — e.g. adding to a Redis sorted set is naturally idempotent, since re-adding an existing member just updates its score instead of duplicating it.

The Redis container backing the queue is named `stream-redis`, not just `redis` — deliberately, because it's meant to stay a *single-purpose* container. `timeline-service`'s precomputed per-user feeds live in Redis Sorted Sets (tweet IDs scored by their `created_at` timestamp, so a feed is always ranked and cheap to paginate — `ZREVRANGE offset..offset+limit-1` is the Sorted Set equivalent of SQL's `ORDER BY ... DESC LIMIT/OFFSET`) — a different Redis data structure than the Stream, but nothing stops it from technically living in the same container. It shouldn't: the Stream is legitimately shared infrastructure (a queue connects a producer and a consumer by definition), but a precomputed feed is `timeline-service`'s own private data, the same category of thing `tweet-db`/`user-db` already taught us to keep separate per service. So `timeline-service` gets its own container, `timeline-redis` — `stream-redis` stays the queue only.

### Why the per-user feed lives in Redis, not Postgres

Three reasons, in order of how much they actually matter at Twitter scale:

* **The access pattern is exactly what Sorted Sets are built for.** A feed is "insert with a score, read the top N by score, trim to the newest K" — `ZADD`, `ZREVRANGE`, `ZREMRANGEBYRANK` are native O(log n) primitives for that. The Postgres equivalent would be an indexed table plus a `DELETE ... WHERE rank > 800` subquery run on every single write just to enforce the cap — no native "trim to top K" operation exists in SQL.
* **Write volume, not read volume, is the real constraint.** Fan-out-on-write means one tweet from a popular author becomes millions of individual writes, one `ZADD` per follower (`fanout_worker.py`). That's the workload in-memory stores are designed to absorb — no WAL fsync per write, no B-tree maintenance, no MVCC/vacuum overhead. Pushing that same write pattern into Postgres would mean serious lock contention and bloat on a table being hammered by inserts continuously.
* **It's disposable, derived data, so it doesn't need ACID durability.** A user's timeline is fully reconstructable from data that already lives durably elsewhere — the follow graph in `user-service`'s Postgres, tweet content in `tweet-service`'s Postgres. Losing `timeline-redis` loses no tweet and no follow relationship; it's a temporary read gap, not data loss. That's precisely the property that makes it safe to keep this in something faster but less durable than the two real databases in the system.

Read latency is a smaller factor worth naming too: this is the single hottest read path in the app (every "open my feed" request), so sub-millisecond in-memory reads beat even a well-indexed Postgres query with disk/buffer-cache overhead. But the write-amplification and disposability arguments are the ones that actually decide it — a low-traffic feed with the same read latency needs would be a much weaker case for skipping Postgres.

### The fan-out worker: consumer groups, and an honest gap around retries

`timeline-service` has no database of its own — it's a thin layer over two things: a **fan-out worker** (`app/fanout_worker.py`, same image as the API, different entrypoint — the same trick as `tweet-outbox-relay`) that consumes `tweet-events` and writes into follower feeds, and the read API (`GET /users/{id}/timeline`) that reads them back out.

The worker joins `stream-redis`'s stream as a **consumer group** (`XGROUP CREATE ... id="0" MKSTREAM`), which is what gives it "resume where I left off" behavior across restarts — the group tracks its own last-delivered position, independent of any single consumer process. For each `tweet_created` event, it calls `user-service`'s `GET /users/{author_id}/followers`, then `ZADD`s the tweet ID into `timeline:{follower_id}` for every follower (scored by the tweet's timestamp), trimming each feed to the most recent `feed_max_size` (800, matching real Twitter's historical home-timeline cap) with `ZREMRANGEBYRANK`. Only after that succeeds does it `XACK` the message.

That last point is where a real gap lives: if `fan_out_tweet` raises (a transient `user-service` failure, say) or the worker crashes mid-processing, the message is left unacknowledged in the consumer group's pending list — but this worker never reclaims it. A production consumer would periodically run `XAUTOCLAIM` to find messages that have been pending too long and retry them; without that, a failed message here just sits stuck, unprocessed, forever. Deliberately left as the simple version for now rather than pretending it's solved — a natural next lesson on retry/redelivery semantics.

One consequence of this architecture worth noting explicitly: **`GET /tweets?ids=...` (a small batch-fetch endpoint added to `tweet-service`) exists specifically to avoid an N+1 problem here.** The Sorted Set only stores tweet IDs, not content — every timeline read needs to hydrate those IDs into full tweets from `tweet-service`. Fetching them one-by-one would mean a 20-tweet timeline costing 20 HTTP round trips; the batch endpoint turns that into one.

### A deactivated user can still post — deliberately not fixed here

Testing surfaced this concretely: a soft-deleted (`deactivated_at` set) user still returns `404` from `user-service`, but `tweet-service`'s `POST /tweets` accepted a tweet from that same `user_id` without complaint, and it fanned out to followers' timelines correctly. This isn't a new gap — `Tweet.user_id` has been an unvalidated cross-service reference since the very first version of `Tweet`; it was never checked against `user-service` at all, for *any* user, active or not. Fixing only the deactivated case would be an inconsistent half-measure.

The tempting fix — have `create_tweet` call `user-service` synchronously before every write — was deliberately rejected. It would make `tweet-service`'s availability depend on `user-service` being reachable on every single tweet creation, which directly undoes the loose coupling that database-per-service and event-driven fan-out were built to provide, in exchange for closing a fairly narrow case. The right fix isn't a cross-service call at all — it's an **auth layer** (the same gap already flagged for `PATCH`/`DELETE` ownership checks): in a real system, a deactivated account wouldn't have a valid session/token to make the request in the first place, so this would never reach `tweet-service`'s business logic to begin with. One missing piece, showing up in two places.

### An nginx API gateway sits in front of all three services

The frontend doesn't call `user-service`, `tweet-service`, and `timeline-service` directly. An `api-gateway` container (`backend/gateway/nginx.conf`) is the single origin the browser ever talks to, reverse-proxying to whichever service owns the request.

Two things this buys, beyond just "one URL to remember":

* **CORS becomes a non-problem instead of a per-service chore.** Server-to-server calls (nginx → FastAPI, or `timeline-service` → `user-service`) aren't subject to CORS at all — it's a browser-enforced restriction on cross-origin requests. Since the browser now only ever talks to the gateway's single origin, no FastAPI service needs `CORSMiddleware`. Without the gateway, every service the frontend calls directly would need its own CORS config, and every new service added later would repeat that.
* **It's the realistic shape of the system.** No production system exposes internal service ports directly to browsers; there's always a single edge. This is also the natural place an auth layer would eventually live, given the auth gap already documented above.

Routing is by **service name, not by REST resource path** — `/api/user-service/*`, `/api/tweet-service/*`, `/api/timeline-service/*`, each prefix stripped and forwarded to the matching container. This was a deliberate choice over routing by resource (e.g. `/api/users/*` → user-service): `tweet-service` owns `GET /users/{user_id}/tweets` (tweets *by* a user) even though the path starts with `/users/`, which collides with `user-service`'s own `/users/*` routes. Naming the gateway prefix after the *owning service* rather than the *resource in the URL* sidesteps that ambiguity entirely, at the cost of a slightly less REST-y frontend-facing URL.

In local dev, the frontend's Vite dev server proxies its own `/api/*` requests to the gateway (`vite.config.js` → `server.proxy`), so the browser's requests to the page (`localhost:5173`) and to the API (also `localhost:5173/api/...`, proxied server-side by Vite) are same-origin — meaning even the gateway itself doesn't need CORS headers for local dev. In a real deployment, the built frontend would be served from behind the same gateway/domain as the API for the same reason.

### The frontend has no real login — an explicit, matching gap

`README.md`'s functional requirements list "create an account and login," but no login/session/token mechanism exists anywhere in the backend — `POST /users` just inserts a row. Rather than build a fake JWT/session layer that would misrepresent what's actually being demonstrated, the frontend's "identity gate" just asks for a username (create new, or look up an existing one via the new `GET /users/by-username/{username}` endpoint) and stores that user object in `localStorage` as "the current user" for every subsequent request. There's no password, no token, and nothing stopping you from typing anyone's username to "become" them — this is intentionally not auth, just a way to pick a `user_id` to act as, matching the backend's actual (lack of) capability instead of hiding it behind a UI that implies more security than exists.
