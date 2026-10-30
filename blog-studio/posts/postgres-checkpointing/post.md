---
title: Checkpointing and Crash Recovery in Postgres
subtitle: How Postgres keeps a committed transaction safe without writing the table on every commit, and how a checkpoint decides how much WAL we replay after a crash. A small live figure for every idea, and one at the end you can crash yourself.
date: 2026-10-30
tags:
  - PostgreSQL
  - Databases
  - Reliability
---

## Two places to write to

Postgres has 2 places to write to:

1. **the WAL** - the [write-ahead log](https://www.postgresql.org/docs/current/wal-intro.html). it is in memory (the WAL buffers) as well as on the SSD (the `pg_wal/` folder, in 16 MB files called segments).
2. **the actual table** - the table files on the SSD. tables are stored in [8 KB pages](https://www.postgresql.org/docs/current/storage-page-layout.html), and when a page is in memory it lives in the [**shared buffers**](https://www.postgresql.org/docs/current/runtime-config-resource.html#GUC-SHARED-BUFFERS). a page in shared buffers that has changes which aren't on the SSD yet is called a **dirty page**.

Why two? Writing to memory is fast, writing to the SSD is slow. One transaction can touch pages all over a table, and writing each of those 8 KB pages on every commit means a lot of random writes. The WAL is one file that we only append to, so writing it is sequential. (We discussed why sequential is so much faster in [Secondary Storages](./secondary-storage-batching.html#why-random-access-is-expensive).)

So on commit Postgres writes only the WAL to the SSD, and writes the pages later, in bulk. That's the whole trick. The rest of this post is about what "later" means, and what happens when the machine dies before "later" comes.

## When a transaction comes

1. the shared buffers might already have the page the transaction needs. if not, Postgres reads the page from the table file into shared buffers first.
2. Postgres applies the change to the page in shared buffers. the table file on the SSD still has the old data, so this page is now a dirty page.
3. the same change is written as a WAL record into the WAL buffers in memory. every record gets an **LSN** (log sequence number), which is its position in the WAL. the page remembers the LSN of the last record that changed it.
4. on `COMMIT`, Postgres adds a commit record and flushes the WAL buffers to the SSD (with `fsync`), up to and including that commit record.
5. only after the flush does the client get `COMMIT` back. **when the WAL is written on the SSD, our transaction is safe.**
6. the dirty page goes to the table file later. this can happen asynchronously, whenever, because the WAL already has the change.

Here is one update going through all of it. Step through it, or flip the page to see one that isn't in shared buffers yet.

::figure write One `UPDATE` from the client to the SSD. The client gets `COMMIT` as soon as the WAL is on the SSD. The table page goes to the SSD later.

The pages are written by the [background writer](https://www.postgresql.org/docs/current/runtime-config-resource.html#RUNTIME-CONFIG-RESOURCE-BACKGROUND-WRITER) and the checkpointer (and sometimes by a backend itself, when it needs a free buffer). They don't read the WAL to do this. The page in shared buffers already has the change, so they just write that page to the table file. The WAL is only read back when something goes wrong, or by replicas (as we discussed in [Optimizations Around Database](./database-scaling.html#the-write-ahead-log)).

> [!IMPORTANT] WAL before data
> A dirty page is only written to the table file after the WAL up to that page's LSN is on the SSD. If it isn't there yet, Postgres flushes the WAL first. So the table file never has a change that the WAL doesn't know about. This is where the name write-ahead comes from.

## What if the system fails?

There are two points where a crash matters:

- **after the WAL write, before the table write** - the transaction is committed and the client already got `COMMIT`. the change is only in the WAL on the SSD, the table file still has the old page. on restart Postgres replays the WAL and the page gets the change again. replaying the WAL makes our state happy. this is **durability**.
- **before the WAL write (so also before the table write)** - the commit is not successful. the client never got `COMMIT`, it got a connection error. there is no commit record for this transaction on the SSD, so on restart it is treated as aborted. since we told the client the transaction failed, and none of it is visible, we have **atomicity** in our system.

::figure crash The same transaction, and the machine dies at two different points. Before the WAL flush, the client gets an error and nothing of the transaction survives. After the WAL flush, the change survives in the WAL and replay puts it back.

> [!NOTE] No undo log
> Postgres doesn't have an undo log. Records of an unfinished transaction can still reach the SSD: a flush writes everything before the commit record, including other transactions' records, and the WAL writer also flushes in the background. Replay applies those records too. But every row version has the id of the transaction that created it (`xmin`), and a transaction with no commit record is aborted, so those rows are invisible to every query. [`VACUUM`](https://www.postgresql.org/docs/current/routine-vacuuming.html) cleans them up later.

## So what is a checkpoint?

If a commit only needs the WAL, why not keep the dirty pages in memory forever? Two problems:

1. the WAL keeps growing. we can't keep the whole book from start to end on the SSD.
2. after a crash Postgres has to replay the WAL. if the pages haven't been written for a week, it has to replay a week of WAL, and the database is down for that whole time.

A [checkpoint](https://www.postgresql.org/docs/current/wal-configuration.html) fixes both. It is a point in the WAL where every change before it is guaranteed to be in the table files. The checkpointer process does it like this:

1. it notes the current WAL position. this is the **redo point**.
2. it writes every page that was dirty at that moment to the table files, then `fsync`s them.
3. it writes a checkpoint record to the WAL, which points to the redo point.
4. it updates [`pg_control`](https://www.postgresql.org/docs/current/app-pgcontroldata.html) (a small file in the `global/` folder) with the location of this checkpoint record.
5. WAL before the redo point isn't needed for crash recovery anymore, so those segments are recycled (renamed and reused for new WAL), unless a replica or the archiver still needs them.

Transactions don't stop during a checkpoint. Their changes are after the redo point, so replay covers them. And the pages aren't written all at once: the checkpointer spreads the writes over [`checkpoint_completion_target`](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-CHECKPOINT-COMPLETION-TARGET) (90%) of the time until the next checkpoint, so it doesn't burst the SSD with I/O.

::figure checkpoint Dirty pages pile up in shared buffers and the WAL grows. The checkpoint marks a redo point, writes the pages that were dirty at that moment, and the WAL before the redo point can go.

A checkpoint happens:

- every [`checkpoint_timeout`](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-CHECKPOINT-TIMEOUT) (default 5 minutes).
- when the WAL since the last checkpoint is about to grow past [`max_wal_size`](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-MAX-WAL-SIZE) (default 1 GB).
- when we run [`CHECKPOINT`](https://www.postgresql.org/docs/current/sql-checkpoint.html) by hand, on a clean shutdown, and at the start of a base backup.

## Crash recovery

When Postgres starts after a crash:

1. it reads `pg_control` and finds the latest checkpoint record.
2. it goes to that checkpoint's redo point. everything before it is already in the table files.
3. it replays every WAL record from the redo point. for each record it compares the record's LSN with the LSN on the page. if the page already has the change (it was written after that record), it skips the record. if not, it applies it.
4. the WAL ends at the first record that is incomplete or whose checksum doesn't match. that's where the crash cut it. (we talked about [checksums on the WAL](./checksums.html#postgresql) before.)
5. transactions with a commit record are committed. every other transaction is aborted.
6. it takes an end-of-recovery checkpoint and accepts connections again.

::figure recovery The machine dies with dirty pages in memory. On restart Postgres starts at the redo point from `pg_control`, skips a record the page already has, applies the rest, and stops at the torn end of the WAL. `tx 905` never committed, so its row stays invisible.

So the time the database is down after a crash is mostly the time to replay the WAL since the last redo point. The checkpoint is what decides how long that is.

## Full page writes

There is one more problem. A page is 8 KB, but the OS and the SSD usually write in smaller blocks (4 KB). If the machine dies in the middle of writing a page, half of it is new and half of it is old. This is a **torn page**, and replaying a small WAL record on top of it doesn't fix it.

So after every checkpoint, the first time a page changes, Postgres writes the whole 8 KB page into the WAL ([`full_page_writes`](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-FULL-PAGE-WRITES), on by default). Recovery starts from that full copy and applies the rest on top. Later changes to the same page, until the next checkpoint, are small records again.

That's also why the WAL volume jumps right after every checkpoint, and it is the main reason why checkpoints that are too frequent are expensive.

## How often should we checkpoint?

- **frequent checkpoints** - less WAL to replay, so a short recovery. but a hot page that changes all the time is written to the table file again at every checkpoint, and after every checkpoint the first change to every page puts a full 8 KB copy in the WAL.
- **rare checkpoints** - a hot page that changes 1000 times between two checkpoints is written once. but there is more WAL on the SSD and a longer recovery after a crash.

::figure tradeoff The same 30 minutes of writes with a checkpoint every 1, 5 or 15 minutes. Move the crash to see how much WAL recovery has to replay. The numbers are illustrative.

The defaults (5 minutes and 1 GB) are a middle ground. For write heavy databases we usually raise `max_wal_size`, so the checkpoints come from the timeout and not from the WAL size. Postgres logs a warning when checkpoints caused by WAL size come closer than [`checkpoint_warning`](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-CHECKPOINT-WARNING) (30 seconds), and with [`log_checkpoints`](https://www.postgresql.org/docs/current/runtime-config-logging.html#GUC-LOG-CHECKPOINTS) (on by default since Postgres 15) every checkpoint is logged with how long it took. Since Postgres 17 the numbers are also in the [`pg_stat_checkpointer`](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-CHECKPOINTER-VIEW) view.

## What we guarantee (and what we don't)

- **durable after COMMIT** - once the client gets `COMMIT`, the commit record is on the SSD. a crash can't take it back.
- **atomic** - a transaction with no commit record in the WAL is aborted after a crash. none of its rows are visible.
- **bounded recovery** - replay starts at the redo point of the last finished checkpoint, not at the start of time. so we replay one to two checkpoint intervals of WAL at most.
- **not a backup** - the WAL in `pg_wal` protects us from a crash, not from a dead SSD or a `DROP TABLE`. for that we need backups and [WAL archiving](https://www.postgresql.org/docs/current/continuous-archiving.html).

> [!WARNING] synchronous_commit = off
> With [`synchronous_commit = off`](https://www.postgresql.org/docs/current/wal-async-commit.html) the client gets `COMMIT` before the WAL flush, and the WAL writer flushes it a bit later. A crash can lose the last few hundred milliseconds of commits (up to 3 × `wal_writer_delay`, so 600 ms by default). The data stays consistent, the lost transactions are just aborted. It's the same deal as `acks=1` in the [WAL delivery system](./wal-delivery-system.html#kafka): only for data that is inherently not that important.

## Now crash it yourself

Every figure above is one idea on its own. This is all of them in one place: the shared buffers, the WAL buffers, the table file, `pg_wal` and `pg_control`.

::figure lab Run transactions, take a checkpoint, and pull the plug whenever you want. Then restart and watch the replay. Turn `synchronous_commit` off to see an acknowledged commit get lost.

> [!TRY] Break it
> 1. Run a few `UPDATE + COMMIT`, then crash before the checkpoint. Every acked commit comes back after the restart.
> 2. Run `UPDATE, no COMMIT` and crash. The client never got `COMMIT`, so the change is gone, or left as a dead row if its record already reached the SSD.
> 3. Turn `synchronous_commit` off, commit and crash right away. The client got `COMMIT`, and the transaction is still lost.
> 4. Take a `CHECKPOINT` before the crash, and see how much less WAL the restart replays.
