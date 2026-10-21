---
title: Optimizations Around Database
subtitle: Connection pooling, caches, read replicas, the write-ahead log and sharding. The problems we hit when we scale a single SQL database, and the trade-offs that come with each fix.
date: 2026-08-15
tags:
  - Databases
  - PostgreSQL
  - Scaling
---

> [!NOTE]
> This article is a summary of what we discussed in [this video](https://youtu.be/0nj2B4PEoDQ?si=82AXR45oBpRSttM6).

When we want to scale a database, we have very much the same kind of problems. Whatever database instance we have, let it be PostgreSQL or MySQL or MariaDB, doesn't matter. We will take any generic SQL database for instance.

## Connection pooling

What happens when we have multiple instances of our same backend doing database queries to our single instance? There might be a case that each pod is opening a new connection for every database query that it makes. In SQL databases, this becomes a bottleneck.

For example, for every new connection, PostgreSQL spawns a new process. That is a process our operating system and our database management system have to overlook. This adds a performance overhead on our existing system, which is doing query planning, and after that all the joins and whatnot.

One of the simplest solutions is to add a connection pooler to our system in front of our database. Usually we keep the connection pooler on the same physical machine as our database instance. The database runs on port `5432` for example, and the pooler on `6432`.

The connection pooler maintains, let's say, 5 or 10 connections with our database, a number that is manageable. Every request that we want to make to our database goes through this connection pool. In a sense the connection pooler acts like a load balancer. Not actually a load balancer, but it holds persistent connections with the database, and its only task is to let the servers connect and disconnect. Whatever performance overhead the constant new connection creation was putting onto the database is now absorbed by the connection pooler.

::figure pool Four backend pods send the same 12 queries. Without a pooler, every query opens a new connection and PostgreSQL spawns a process for it. With a pooler, the database keeps the same 5 connections.

> [!TIP] Instagram, 2012–13
> When Instagram was blowing up around 2012–13, they had a single PostgreSQL instance for millions of users, and they were vertically scaling it up. No sharding, no read replicas. Each process took 2 MB of their RAM, and their 64 GB of RAM was getting exhausted pretty quickly due to a lot of backend instances making connections. So they introduced a connection pool.

This is one of the simpler solutions, for a pretty early scale that we might have as our app grows.

## Know your read patterns

Next, we have to identify the patterns of our users. We usually use a database to do two things: to hold the data that we write, and to access the data that we read.

In most systems, reads become the bottleneck. Take any social media application like Reddit or Facebook. These are inherently read-heavy applications. A user that is visiting the website is usually only there to access the data, not to create it. There are a lot of people creating data, but the amount of people consuming that data skews a lot more than those who are creating. So we need to identify and analyze what kind of reads are coming into our application.

## When a small amount of data is hot

Take a naive example of something like YouTube. A lot of videos are being uploaded by a lot of creators, but the consumers are more than the creators, and some creators are much more popular than the rest. Meaning there are only some videos that are accessed much more, and a lot of videos have very few views. A small amount of data is being accessed in much more quantity, and these videos are causing the bottleneck in our system.

This data is what we call the hot shard or the hot part of the data. Hot means it is being actively accessed. The rest of the data is not causing any kind of bottleneck. Only this amount of data is.

So what if we put this data into something that sits in front of our database? Our servers can reach that store instead, to get the data very fast, and it will be optimized for reads. We take the chunk of our database that is causing the problem and put it in the cache.

::figure cache 12 reads, 9 of them for the two hot videos. Without a cache, every read reaches the database. With a cache, only the first read of each hot video and the cold reads do.

This cache can be replaced with anything that is relevant to our problem:

- **Key-value data:** Redis, or Valkey. Valkey is a fully open-source fork of Redis, and a lot of companies are moving to it after the license change at Redis.
- **Static files:** HTML, videos, audio, anything that we might put in an S3 bucket. It should be in a CDN.

Till this point we are solving pretty much 90% of systems' problems.

## When everything is hot

Now let's say we don't know for sure which data is causing the problem, or all of the data in our database is being accessed equally. Take any chunk: the reads on each of the chunks are the same. There is no hot shard here. Everything is hot, and our entire DB is being accessed.

Previously we copied the part that was being constantly accessed. What if we just replicate the whole thing? What if we create another instance of our same database, a DB copy, and put the two DBs on separate host machines? Our servers make a request to a load balancer, and the load balancer routes the reads to either of those DBs.

Seems pretty simple, right? So what about writes? How will the DB copy stay in sync with our original database?

### Dual writes

One solution is: whenever a write happens, we first write into the original database, then write it to the copy database again. This approach is called **dual write**, and it is used a lot in our industry. But usually when migrating from one set of technology to another, not when we are running the same instances.

We can do this, but it causes a few problems:

- **Two network trips.** Whenever we make an API request to another machine, most of the time is spent waiting for the data to travel from one machine to another. Not the computation, not the rendering. CPUs and RAM are very fast, but we can't fight physics: our data has to travel. With dual writes we double our write time, and our backend server is doing twice the work.
- **Out of sync.** What if the copy DB fails? Let's say someone spilled water on the database machine. Then we write to the original only. Now what if the original goes down and the copy comes back on? We are out of sync, and we don't know which database to trust.

::figure dualwrite One server writes to both databases. The copy misses a write while it is down. Then the original goes down, and the copy answers with an old value.

Whatever truth we have in our system should be told by only one machine: a **single point of truth**. In our case, that is the original. To get there, we need to understand how a database performs a write.

### The write-ahead log

Whenever a database wants to modify something, it first produces something called a **write-ahead log**, or WAL. The name itself suggests that it is a log: a book that is being written ahead of any modification that we want to do to the data. Insert, update, delete, any kind of operation that modifies data that already exists in our system: the database first writes it in the WAL.

The database produces a ledger of what it wants to do, so that it can do a lot of performance optimizations like bulk writes. There is so much to learn about database internals here, like how B+ trees work, how data is stored in pages, and how the database can cache those pages and write to them in bulk so that it doesn't have to do disk I/O every time. Disk I/O is slow compared to RAM I/O. The WAL is stored to the disk before the actual execution of any modification query.

The WAL has everything written in detail about what operation to do. If we give this book to the copy database, it can reproduce the original database from start to end. This is the simple formula behind **read replicas**: a replica of our database that we use for reads.

::figure wal The primary plans and runs the update, and writes it to its WAL first. The WAL goes to both replicas, which only replay it. Reads then spread across the replicas.

Whenever the original database produces WAL, we transfer it to the copy database. The copy doesn't have to do the computation that happened before the WAL was generated. It just executes the WAL: insert, update, delete, whatever operation the write-ahead log tells it to do. For this we usually use something called **CDC, change data capture**: whenever a data change happens, we capture that change and send it over the network to our copy database.

And we are not limited to one copy. We can send the WAL to another copy database as well. Now we have one primary database and two replicas. All the writes from our servers go to the primary, the primary generates the WAL, and we send the WAL to the replicated databases.

> [!NOTE] Fun fact
> OpenAI uses around 50 read replicas of PostgreSQL. A couple of months back they released an article about how they scaled PostgreSQL to that point.

There are a lot of database native extensions around read replication. For Postgres, there is `pglogical`, and there is **Pgpool**, which does pretty much everything: connection pooling, load balancing and high availability. Always refer to the latest documentation.

## When writes can't keep up

Reads are okay now. But what if our single database can't keep up with how much WAL it is producing, and doesn't get the time to execute it?

Let's say we can execute 10 WAL per second, and our writes are amplified to the rate where we generate 15 per second. Each second we have an extra 5 that we can't execute. This is a problem.

Take a users table with 1 million users. For our understanding we can split these users into two parts: the first being 1 to 500K, and the second 500K+1 to 1 million. Instead of writing everything to the one original DB, which can only execute 10 WAL per second, what if we split it into two separate databases? Each database instance can execute 10 WAL per second, so together we have 20 WAL executions per second. This is called **sharding**: we have created shards of our database.

::figure shard 15 writes per second against a database that executes 10. On one node the backlog grows every second. Split the users table into two shards, and each shard has room to spare.

### Partitioning vs sharding

There is also something called **partitioning**. Partitioning divides a large database into small pieces within a single database. Sharding takes this a step further by dividing those chunks across independent database servers.

With partitioning, everything lives on the same node, the same physical server. But a single node can't do much more due to the physical constraints that it has to follow. Partitioning is a good way to solve this write amplification problem, but usually it is not enough when we reach that scale. Then we have to go to sharding, and scale horizontally, to have the peace of mind of having enough compute and enough physical resources.

But sharding usually causes a lot of problems if not done correctly. Every database has a query planner. SQL is inherently declarative: we tell the database what we want, like `SELECT id, name FROM employee`, and how to execute that query is done by the query planner. If we have two separate nodes, we can't use the benefit of the query planner fully. If some of the data lives in the first shard and some in the second, we have to do two network calls to join the data. We have to do what the query planner does for us, and we have to maintain that system.

Usually we don't shard on our own. There are managed services for this, like PlanetScale, with Neki for Postgres. They started with MySQL first, on top of **Vitess**, an open-source clustering system that was developed at YouTube. (This is not sponsored. I just love PlanetScale and use it.)

## The trade-offs

There are a lot of nuances for each case, and we have to slightly adjust our approach.

The write-ahead log that is generated is deleted after some time. We can't keep the whole book from start to end. There is also the problem of network failure. Let's say one copy database fails to get the WAL that was generated by our original database, and only the other copy received it. That copy is now out of sync: it doesn't have the actual data that our original database has. In this scenario we have two options. We can either provide stale data to our users, or we can be unavailable to users and give a 503 or a 500 error.

You might say: if a database is out of sync, remove it from our setup, from the pool that the reads come through. In the case of Postgres that will usually be Pgpool or PgBouncer. But let's say there are 25K requests per second, and each database can only handle 10K reads per second. The first one is at its fullest, the second one is at its fullest, and we have 5K requests that are pending. If we route those 5K to the remaining databases, they might also go down. So we either drop them and become unavailable, or we keep the out-of-sync database and stay available, but inconsistent: we serve stale data to the user because the copy DB doesn't have the updated value.

::figure tradeoff Three read databases, 10K reads per second each, and 25K reads per second coming in. One replica missed a WAL entry. Choose to stay available or to stay consistent, then watch the primary go down.

This is the trade-off we make. We either stay highly available, or highly consistent: show only the latest data, and drop requests when we can't.

There might also be the case where our original database itself goes down. Pgpool handles this as well: it promotes one of the copies, and that copy becomes our primary database for writes.

That is the thought process, with the trade-offs, that comes when we build databases for scale. Pretty much everything in computer science is very interesting, especially databases and operating systems. I hope you learned something new.
