# Scaling plan

This is the order in which Rhenko grows, what changes at each step, and what would trigger it. The current production setup
(one server running Compose, see the README) is the first step. Nothing below is built yet unless it says so. Each step
should be measured before it is started, and the end-to-end suite should pass before and after it.

## Where the limits are today

- **Calls.** Every change to call state takes one database lock shared by all calls (`CALLS_LOCK` in `lib/call-state.ts`).
  Signals, heartbeats and starts queue behind each other. The maintenance tick no longer takes the lock when nothing is due
  (`due_at`), so the remaining cost is per call action. This is fine for a few hundred simultaneous calls on one server.
- **Feeds.** Home and Following are computed when a page loads, from the database, not from a precomputed timeline. Reads are
  cheap at small scale and grow with the number of posts a person follows.
- **One database server.** Writes all go to one Postgres. Reads go there too.
- **One app server.** The Compose file runs one app container. The app itself keeps no state a restart loses, but the boot
  id is per process (see below).

## Step 1: one server, measured (now)

- Keep the Compose stack as it is. Postgres tuning in `docker-compose.yml` is sized for 4 GB.
- Watch: CPU and memory on the host, `pg_stat_statements` for the slowest queries, the length of the database's connection
  queue, and the lock wait time on `pg_advisory_xact_lock`. Keep a note of the numbers each week.
- Trigger for step 2: sustained CPU above 70 percent, or the slowest feed query above 200 ms at the 95th percentile, or call
  actions waiting on the lock for more than 100 ms.

## Step 2: a read replica and a second app server

- Add a streaming replica on a second server (`pg_basebackup`, then `primary_conninfo`). Set its `max_standby_streaming_delay`
  so long reads on the replica do not stop replication.
- Route read-only feed, search and Explore queries to the replica with `RHENKO_DATABASE_REPLICA_URL`. Anything the signed-in
  person just wrote (their own posts, their settings, their drafts) reads from the primary, so nobody sees their own change
  missing. Other people's posts may lag by the replica's delay, which should stay well under a second.
- Before the second app server: set the same `RHENKO_BOOT_ID` on every server. The boot id tells a tab that the server
  restarted, and a tab that reconnects to a different server with a different id clears call state it still needs. Until this
  is set, keep one app server.
- Put the app servers behind Caddy with several upstreams. Live events work across servers, because they go through the
  database (`events` and `LISTEN`).

## Step 3: connection pooling

- Add PgBouncer in transaction mode in front of the primary once there are more than two app servers. The app already runs
  without prepared statements (`prepare: false`), which transaction pooling needs. `LISTEN` must keep a direct connection, so
  the event bus connects to Postgres itself, not through PgBouncer.

## Step 4: calls without one global lock

- Replace `CALLS_LOCK` with two kinds of lock. A lock per call, taken by every action on that call (signals, heartbeats,
  ICE, accepting, ending). A lock per person, taken in a fixed order (lowest id first) by any action that checks or changes
  what the person is in (starting a call, joining, a sign-out ending their calls, a block).
- Keep a table of which calls each person is in, so a person's lock covers their calls without scanning every call.
- Release criteria: the two-person and group call flows, reconnects, sign-out during a call, a block during a call, and
  the ring timeout all pass the end-to-end suite, run on purpose with two browsers. Calls are the highest-risk change, so it
  goes out behind a flag (`RHENKO_CALL_LOCKS=per-call`) for a week before the old lock is removed.

## Step 5: precomputed home timelines

- Fan out on write for accounts with up to about 5,000 followers: a post is written to a `home_timeline` table row for each
  follower. For accounts above that, do not fan out. The reader merges those accounts' recent posts into the timeline at read
  time. This keeps the write cost bounded for very large accounts.
- Backfill the table in batches, and keep the read path on the old query until the table is complete for an account.
- Measure first: the write cost is roughly the number of followers per post, so the threshold should come from the real
  follower distribution.

## Step 6: partition and shard

- Partition the largest tables by time first (`events`, `feed_impressions`, `post_dwell`, `notifications`), since most of their
  rows are old and are deleted by retention. This needs no application change beyond the retention jobs.
- Shard by person id only when one primary can no longer hold the write load after steps 2 to 5. Sharding changes which
  queries can join across people (follows, blocks, conversations), so it is a design project of its own and is not planned in
  detail here.

## What each step is for

| Step | Main effect | Rough scale it supports (estimate, to be measured) |
| --- | --- | --- |
| 1. One server | Launch, learning | Thousands of people, a few hundred concurrent calls |
| 2. Replica and second app server | Feeds and search off the primary | Tens of thousands of active people |
| 3. Pooling | More app servers without more database connections | Low hundreds of thousands of active people |
| 4. Calls per person | Calls do not queue behind each other | Calls at the same scale as the rest |
| 5. Timelines | Home loads at a flat cost | Hundreds of thousands to low millions of active people |
| 6. Partition, shard | Writes spread across servers | Millions of active people and beyond |

These ranges depend on posting rates and how many people each account follows. They are starting points for measuring, not
promises.

## Costs to plan for

- Each server costs what its droplet costs. A replica is a second droplet of the same size.
- Storage is R2 for uploads and the database backups, which are charged per GB stored and have no egress fee. The
  lifecycle rule on `db-backups/` keeps backup storage bounded.
- The first real cost jump is the second database server, then the move to several app servers behind a load balancer.
