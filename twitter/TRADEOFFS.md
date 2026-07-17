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

**A real bug surfaced while adding the discovery endpoints below, worth keeping as a lesson**: rebuilding `user-service`/`tweet-service` (`docker compose up -d --build`) recreates those containers with new internal IPs, but nginx's `proxy_pass` resolves an upstream hostname **once**, at startup, and caches the IP for the life of the worker process. Without restarting the gateway too, it kept forwarding to the *old* IP — which Docker had since reassigned to a different service, so requests to `tweet-service` silently landed on `user-service` and 404'd. The fix: `resolver 127.0.0.11 valid=10s;` (Docker's embedded DNS) plus routing through a `set $upstream ...` variable, which forces nginx to re-resolve the hostname per-request instead of caching it forever. One nginx-specific gotcha inside that fix: `rewrite ... break` halts the entire rewrite-phase pipeline for a location, so a `set` directive placed *after* a `break`-flagged `rewrite` never executes — the `set` has to come first.

### Discovery: a "Random" timeline tab, and top-followed / random people

The home timeline (`GET /users/{id}/timeline`) is fundamentally closed-world: it only ever shows tweets from people you already follow — fan-out only pushes to followers, so there's no path to discovering anyone new from that feed alone. Two additions address that, both intentionally simple:

* **`GET /tweets/random`** (tweet-service) and **`GET /users/random`** (user-service) — an `ORDER BY random() LIMIT n` query, each accepting a repeated exclude parameter (`exclude_user_ids` / `exclude`) so the frontend can ask for "random tweets/people, but not ones from people I already follow (or myself)." The frontend's "Random" timeline tab and Discover page's "Suggested" section both call these with `[currentUser.id, ...followingIds]` as the exclusion set.
* **`GET /users/top-followed`** (user-service) — a `JOIN follows GROUP BY user_id ORDER BY COUNT(*) DESC` query, returning a new `UserWithFollowerCount` schema (adds `follower_count` to `UserOut`). Powers Discover's "Popular" section.

`ORDER BY random()` is a deliberate simplification, not a scalable pattern — it forces Postgres to score and sort every matching row before applying `LIMIT`, i.e. a full table scan, which gets worse linearly as the tables grow. At this lab's scale (dozens of rows) that cost is invisible; at real scale, "give me N random rows" is normally solved differently — sampling from a maintained random ordering key, `TABLESAMPLE`, or serving from a periodically-refreshed cache of candidates rather than computing fresh randomness per request. Not fixed here because the lab has no traffic that would ever expose the cost — a case where the honest simplification is more useful than a premature scalability fix for a query nothing here will ever stress.

### The frontend has no real login — an explicit, matching gap

`README.md`'s functional requirements list "create an account and login," but no login/session/token mechanism exists anywhere in the backend — `POST /users` just inserts a row. Rather than build a fake JWT/session layer that would misrepresent what's actually being demonstrated, the frontend's "identity gate" just asks for a username (create new, or look up an existing one via the new `GET /users/by-username/{username}` endpoint) and stores that user object in `localStorage` as "the current user" for every subsequent request. There's no password, no token, and nothing stopping you from typing anyone's username to "become" them — this is intentionally not auth, just a way to pick a `user_id` to act as, matching the backend's actual (lack of) capability instead of hiding it behind a UI that implies more security than exists.

### Deployment: one droplet, docker compose, and a production compose file that duplicates rather than overlays

This runs on a single small DigitalOcean droplet (1 vCPU, ~1GB RAM) via `docker compose`, not a managed container platform (ECS/K8s) or per-service PaaS deploys. That's a deliberate match to what this project is for — the point is showing the architecture, not surviving real load — and it means the exact same compose-based mental model used throughout local dev carries over to how it's actually hosted.

A few things had to change for a box that small, and one of them was a real bug caught during setup:

* **`compose.prod.yaml` is a complete, standalone file — not a `docker-compose.override.yml`-style overlay of `compose.yaml`.** The tempting approach is an overlay that only specifies the diffs (e.g. `ports: []` to strip a service's published ports for production). That was rejected specifically because Compose's file-merge semantics for list-type fields like `ports` aren't something to bet a security property on without verifying them precisely — and the cost of getting it wrong here isn't cosmetic, it's Postgres and Redis reachable from the public internet with no auth. A full, explicit file that a reader can audit top-to-bottom for "what's actually exposed" was worth the duplication.
* **No internal service has a published port in production** — `tweet-db`, `user-db`, `stream-redis`, `timeline-redis`, `tweet-service`, `user-service`, and `timeline-service` are reachable only over the compose network, by service name. Only `api-gateway` publishes a port (`80`, and eventually `443`). This is the same "single entry point" reasoning as the gateway itself, just applied at the network-exposure level instead of the routing level.
* **`ufw` is defense-in-depth here, not the actual guarantee.** The droplet also runs `ufw` (allow `22`/`80`/`443`, deny the rest) — but the real protection against exposing Postgres/Redis is *not publishing their ports in the compose file* in the first place. Docker manipulates `iptables` directly to implement published ports, inserting its own rules ahead of `ufw`'s — a well-known gotcha where `ufw deny` can still leave a `docker run -p` or compose `ports:` mapping reachable from the internet, because `ufw` never gets a chance to see that traffic. Verified this held: after deploying, all seven internal ports were confirmed unreachable from outside, while only `80` responded.
* **The frontend ships as static files, served by the same gateway nginx — no Node.js runs in production at all.** `npm run build` happens once, locally (or in CI), and only the resulting `dist/` gets synced to the droplet; `nginx.prod.conf` adds a `root`/`try_files` block (with SPA fallback to `index.html` for client-side routing) alongside the same three `/api/*` proxy locations the dev gateway already had. Building the React app was never something the tiny droplet needed to do.
* **Postgres gets memory tuned down** (`shared_buffers=32MB`, `max_connections=20` per instance) since the defaults assume more headroom than a ~1GB box has to spare, and this lab's actual data volume is tiny.
* **A 2GB swapfile was added before anything else.** The droplet ships with none by default. Docker image builds for the Python services (compiling/installing `psycopg`, `pydantic-core`, etc.) can spike past what's physically available, especially with 11 containers' worth of images all building around the same time — swap is what turns that into "slower" instead of an OOM-killed build. This is also why building the images directly on the droplet (rather than a registry-based build-elsewhere-and-pull flow) was an acceptable simplification here rather than added complexity: with swap in place as a safety net, and no CI pipeline this project needs yet, the extra moving parts of a container registry weren't worth it for a personal deployment.

### TLS: real end-to-end HTTPS via Let's Encrypt, and a Cloudflare gotcha along the way

The domain (`twitter.zewenw.com`) sits behind Cloudflare (proxied, orange-cloud DNS), which introduces two independent TLS hops: browser ↔ Cloudflare edge, and Cloudflare ↔ origin. The first symptom of getting this wrong was Cloudflare returning its own **521 "Web server is down"** error on `https://twitter.zewenw.com` — plain HTTP worked fine, but Cloudflare's SSL/TLS mode (`Full`/`Full strict`) was trying to reach the origin over HTTPS on port 443, and the origin nginx wasn't listening there yet. The fix wasn't a Cloudflare dashboard setting (e.g. dropping to `Flexible` mode, which would've "worked" by having Cloudflare talk to the origin over plain HTTP — silently reintroducing an unencrypted hop) — it was finishing the actual TLS setup on the origin, which was already the plan.

Cert issuance used certbot's **webroot method**, not `--standalone`: standalone mode has certbot bind port 80 itself to answer the ACME HTTP-01 challenge, which would mean stopping the running nginx container (and the whole site) just to get a certificate. Webroot mode instead has nginx serve the challenge files certbot drops into a shared directory (`location /.well-known/acme-challenge/ { root /var/www/certbot; }`, bind-mounted into the container), so the site never goes down during issuance — including future renewals.

Two things that would silently break on renewal if not handled explicitly:

* **nginx caches the certificate in memory once loaded — a renewed file on disk does nothing until nginx reloads.** Ubuntu's certbot package installs its own systemd timer that renews the cert automatically, but that's oblivious to the fact that the actual TLS termination happens inside a Docker container. A deploy hook (`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`, which certbot runs automatically after any successful renewal) runs `docker exec backend-api-gateway-1 nginx -s reload` — without it, the site would keep serving an expiring certificate indefinitely, cert file on disk notwithstanding.
* **The two server blocks in `nginx.prod.conf` split responsibility deliberately**: port 80 does exactly two things — serve ACME challenges, and `301` redirect everything else to `https://`. Port 443 does everything the app actually needs (API proxying, static frontend, SPA fallback). This keeps the redirect from ever fighting with a live challenge request during renewal, since the challenge path is excluded from the redirect rule.

`compose.prod.yaml` mounts the host's `/etc/letsencrypt` (where certbot, running directly on the droplet, writes cert files) read-only into the `api-gateway` container, rather than running certbot inside a container itself — simplest option given certbot only needs to run twice a year, and keeping it a host-level concern means the container doesn't need write access to a directory holding private keys.

### Image uploads: self-hosted MinIO, presigned URLs, and two more real bugs

`Tweet.image_url` and `User.avatar_url` are both nullable string columns — no new service, no new table. The images themselves live in **MinIO**, a self-hosted S3-compatible object store running as one more container on the same droplet. This isn't a toy stand-in for "real" object storage — MinIO implements the actual S3 API, so the client code here (`boto3`, presigned URLs) is identical to what talking to real S3/DO Spaces/Cloudflare R2 would look like; only the `endpoint_url` would change if this ever moved off-box. One bucket (`media`), split by key prefix (`tweets/`, `avatars/`) rather than two buckets — no reason these needed separate access policies.

Upload is **presigned, not proxied**: `POST /tweets/image-upload-url` (or `/users/avatar-upload-url`) hands back a short-lived signed `PUT` URL plus the eventual public URL; the browser uploads directly to that URL, then sends the resulting `image_url` as a plain string when it actually creates the tweet or sets the avatar. Neither service ever touches the image bytes. `generate_presigned_url()` is worth noting as a pure local operation — signing is just HMAC-SHA256 over the request, no network call — which is why each service can mint these URLs without needing live connectivity to MinIO at request time.

Two real, reproducible bugs came out of wiring this up, both worth keeping as lessons:

* **nginx's default silently breaks S3 signature validation.** `proxy_pass` rewrites the `Host` header to the upstream's own address (`minio:9000`) unless told otherwise — invisible for the `/api/*` routes, since FastAPI doesn't care what `Host` says, but fatal for `/media/`, because S3-style presigned URLs sign the `Host` header as part of the request. MinIO received `Host: minio:9000` while the signature was computed against `localhost:8080` (or `twitter.zewenw.com` in prod), and rejected every upload with `SignatureDoesNotMatch`. Fixed with an explicit `proxy_set_header Host $http_host;` in the `/media/` location — `$http_host` specifically, not `$host`, because `$host` silently drops a non-standard port (`:8080` in local dev), which would have reintroduced the exact same mismatch.
* **`Base.metadata.create_all()` doesn't alter existing tables — a gap already flagged in this file, and it bit for real here.** Adding `image_url: Mapped[str | None]` to the `Tweet` model was invisible to any already-existing `tweets` table, since `create_all` only creates tables that don't exist yet; it was tested against tables created *before* this change, in a dev database that had been alive across many earlier sessions. The column had to be added by hand (`ALTER TABLE ... ADD COLUMN`) locally, and the same step is needed on the production droplet before deploying this — the exact scenario Alembic exists to handle, and the exact reason this project keeps naming that as a gap instead of quietly working around it every time it bites.

### The sidebar has Search and Notifications links that go nowhere real, on purpose

The left sidebar (`Sidebar.jsx`, replacing the old top nav bar) mirrors real Twitter's five links — Timeline, Search, Notifications, Follow, Profile. Two of those route to placeholder pages that say outright they're not built, rather than being hidden or silently omitted. Both would be real, separate pieces of work, not something to bolt on as a side effect of a layout change:

* **Search** needs an actual search endpoint on both services — nothing currently lets you query tweets by content or users by name; `README.md` has listed this as a functional requirement since the very first version of this project, unimplemented the whole time.
* **Notifications** is the bigger one — it's not just a new endpoint, it's a new kind of data (an event stream keyed by *recipient*, not by the entity that changed) probably wired through the same event-driven infrastructure as the timeline's fan-out worker: a like, reply, or follow would need to become an event the *target* user's notification feed picks up, the same shape of problem as "a tweet needs to reach every follower's feed." Worth its own design pass, not a rushed addition.

The "Follow" page (`Follow.jsx`, replacing the earlier "Discover" page) folds in what used to be two separate concepts — suggested people to follow, and your existing followers/following lists (previously only reachable from a profile page) — into one tabbed view, since they're all fundamentally "people, and whether you follow them" data. The "Popular" (top-followed) section from the old Discover page was deliberately dropped from the UI in this pass — the `GET /users/top-followed` endpoint itself is untouched and still fully functional, just not currently surfaced anywhere in the frontend.

### Profile page gains Replies and Likes tabs, surfacing a latent bug and an unused index

Adding these two tabs exposed a real, pre-existing bug: `GET /users/{id}/tweets` was never filtering `parent_tweet_id`, so a user's replies were silently mixed into their main "Tweets" tab the entire time — invisible until there were two separate tabs to compare against each other. Fixed by adding `Tweet.parent_tweet_id.is_(None)` to that query, and a new `GET /users/{id}/replies` (identical shape, `is_not(None)` instead) for the new tab.

`GET /users/{id}/likes` is the more interesting addition: `likes` already had `Index("ix_likes_user_id", "user_id")` — added back when the `Like` table was first designed, explicitly described in this file at the time as existing "to support the reverse lookup ('tweets this user liked')" — but no endpoint ever actually performed that lookup until now. The query joins `Tweet` through `Like` filtered on `Like.user_id`, ordered by `Like.created_at` (when *you* liked something) rather than `Tweet.created_at` (when it was posted) — matching what real Twitter's Likes tab actually orders by, and the reason the join can't be replaced with a simpler `Tweet.created_at` sort.

The profile banner is deliberately static — a plain grey rectangle, no upload capability, no new column. Real Twitter lets you upload a cover photo; this only needed to *look* like the space exists, not actually support filling it.

### Replies moved from a dedicated page into an inline, recursive expansion on TweetCard

`TweetDetail.jsx` and its `/tweets/:tweetId` route are gone. Clicking "Replies" on a tweet no longer navigates anywhere — it toggles an expanded section inside that same `TweetCard`, holding a compose box and a paginated (`limit=5`, "Load more") list of replies, fetched from the same `GET /tweets/{id}/replies` endpoint the old page used.

The interesting part is what happens for free: each reply in that expanded list is rendered as another `TweetCard` — the exact same component, not a stripped-down variant — which means a reply gets its own "Replies" toggle, its own like button, its own nested expansion. Threaded replies-of-replies work without any explicit recursion-depth handling; it's a direct consequence of "a reply is a tweet like any other" already being true at the data layer (`parent_tweet_id` is the only thing that distinguishes them), rather than something deliberately engineered.

This does trade away a permalink — there's no longer a URL that points at one specific tweet plus its replies in isolation, the way `/tweets/:tweetId` used to. Not fixed here since nothing in the app currently needs to link to an individual tweet from outside the feed it appears in; if that changed, the fix would be adding the route back as an alternate way to reach a `TweetCard` already capable of everything it needs, not rebuilding reply UI a second time.
