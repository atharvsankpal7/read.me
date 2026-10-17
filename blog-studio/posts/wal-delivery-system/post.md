---
title: Building a WAL Delivery System with Kafka
subtitle: Kafka-backed log delivery to 1st and 3rd party services. A walkthrough of the design, with a small live figure for every idea and a full simulation you can break at the end.
date: 2026-10-15
tags:
  - Kafka
  - Distributed Systems
  - Reliability
simTitle: WAL delivery system, live
simHint: Click any box to inspect it, change it, or break it.
---

## What we are building

We are building a WAL system with Kafka for large scale distributed systems. It reliably sends logs to other 1st or 3rd party services without them ever needing to install Kafka. Kafka is just our current choice, we can swap it for any other client as well.

The goal is to build a highly available, eventually consistent, durable and fault tolerant store for logs that need to be transported to multiple destinations when produced.

In phase 1 we built it as an AT LEAST ONCE delivery mechanism. Order of messages doesn't matter in our case.

Before the details, here is the whole trip one log takes. Step through it, or flip the route to see a log that needs processing first.

::figure overview One log from intake to commit. The producer only answers once the log is durable, and the consumer only commits once every destination is taken care of.

## The pieces

### Control plane

- handles all the configuration like Kafka topics, the communication standards for destination services, and which topics need to be consumed by which destination services.
- each topic has its own acknowledgement config. if it isn't provided we default to `-1` which is `all`. if a topic is allowed to have `acks=1` it means that topic is inherently not that important.
- once reconciliation between the control plane database and Kafka is done, the control plane pushes the fresh config to both producer and consumer.
- producer and consumer cache the config locally in memory so we don't have to call the control plane each time.
- if the push fails, producer and consumer also poll the control plane as a fallback.
- if the control plane is down, the producer or consumer asks its peers through the load balancer to get the config.

::figure config Three ways config reaches a pod: the push, the poll when a push is lost, and asking a peer through the load balancer when the control plane itself is down.

### Producer service

- the single entry point in our system that intakes the WAL logs to be delivered.
- based on the control plane standards it either sends the log directly to Kafka for durability, or if the log needs some CPU/IO bound processing it stores the log in the outbox.
- returns success only after Kafka acknowledges with the acks config of that topic (or after the outbox row is committed in Postgres for logs that need processing).

### Outbox (Postgres + pg-boss)

- logs that need processing go directly to Postgres. our in-house processor picks up the row using `SKIP LOCKED`.
- every row moves through these states: `pending` → `processing` → `processed` → `stored`.
- after processing is done the processed log is sent to Kafka. only after Kafka acknowledges do we flag the row as `stored`. so there is no dual write problem.
- there is a time limit on how long a row can stay in `processing`. if it doesn't reach `processed` or `stored` in time, we retry the processing.
- processing is idempotent, the flags make sure an already processed row is not written again.
- after 5 failed attempts the row moves to the DLQ.

::figure outbox Two workers share the table with `SKIP LOCKED`. w2 crashes holding a row, its lease runs out and the row is retried. `pay_d4a9` never processes and lands in the DLQ after 5 attempts. Rows are only flagged stored after Kafka acks.

### Kafka

- stores the original (+ processed if applicable) log durably so it can be sent to all of its destinations.
- retention is 7 days for normal topics and 14 days for retry and DLQ topics.

The acks setting from the control plane decides what "stored" actually means. With `acks=1` the leader answers alone, so a leader crash right after the ack can lose a log the producer already confirmed. That's why it is only allowed for topics that are inherently not that important.

::figure acks The same write and the same leader crash, once with `acks=1` and once with `acks=all`.

### Consumer service

consumer is the one that talks to the destination services. it sends the plain or processed message from Kafka to each service using the communication method given for that service by the control plane. there are 2 types:

1. service specific consumer - for a busy service which intakes a huge amount of logs. it has its own dedicated delivery that consumes the related topics for that service. this is to avoid the noisy neighbour problem.
2. shared consumer - for non-busy and normal services, a shared consumer sends the data from topics to all the destinations it is meant for.

## How we do fault tolerance

### On the way in

1. producer services are put behind a load balancer with their own watchdog to take over in case of failure.
2. every log is stored with an idempotency key. since phase 1 is AT LEAST ONCE, if we retry we can dedupe the log.
3. producer has its own fallback buffer to store the message without causing a timeout if Kafka is down.
4. Kafka replicates each log multiple times across various nodes through brokers. broker health checks are done by separate controllers which Kafka handles internally using the RAFT consensus protocol (KRaft).

### On the way out

5. there are multiple consumer groups subscribed to certain topics. each consumer group has multiple nodes so we don't have a single point of failure.
6. consumer saves failed deliveries in retry topics with staged backoff + jitter, along with the log, original topic, idempotency key and the service it failed for transiently (transient error meaning an error which can be retried without changing the payload, e.g. service temporarily down).
7. consumer also has its own DLQ in case retries are exhausted or the service gives a permanent error (e.g. 400 bad body).
8. message offsets are only committed after the message is either successfully sent or stored durably somewhere. so if a topic is subscribed by A, B and C and C is slow or down, we send C's copy to the retry topic and then commit.
9. consumer also tries to dedupe messages using the idempotency key + destination set. since this set has a TTL expiry we can't fully guarantee idempotency here, so we assume destinations also dedupe on the idempotency key.

::figure commit Points 8 and 9 together. search-index goes down and its copy is parked in the retry topic before the commit. Then the consumer crashes before committing 44: the next pod reads it again and the destinations drop the duplicate.

### When everything else fails

10. whenever a message goes to the DLQ we send an event to our telemetry system with an alert. an on-call engineer processes DLQ data manually.
11. a daily worker moves DLQ logs that haven't been processed after 10 days into an S3 bucket, so nothing is lost when the 14 day retention runs out.

## How we retry without making an outage worse

- if a destination service gives a permanent error we fail fast and send the data to the DLQ directly without retrying.
- if a destination service gives a transient error we send that message to a retry topic which is consumed by a retry consumer.
- retry topics are partitioned by destination service. each destination gets its own partition, so all the data for one destination is in a single place and a single outage doesn't disturb other services.
- the retry consumer is a special consumer which takes messages meant to be retried and sends them directly to the actual destination (not back to the main consumer).
- step 1 waits 10 seconds, step 2 waits 1 minute, and step 3 waits 5 minutes, with jitter. each delay starts when the message enters that step. the simulation at the end runs retry timers 10 times faster, with retention compressed separately.
- if step 1 retry fails transiently we send that message to step 2, and if step 2 fails we send it to step 3. a transient failure at step 3 exhausts that message's retries and sends it to the DLQ. permanent errors go straight to the DLQ from any step.
- we use jitter while retrying so we don't burst the destination service with a lot of data in a short period of time.

An outage doesn't fail one message, it fails hundreds at the same moment. Without jitter they all wake up at the same moment too, on every step.

::figure jitter 200 messages fail in the same second. Without jitter, each retry step hits search-index with all 200 at once. With ±30% jitter, the same retries spread across the window.

### Pausing a destination
- each destination has a separate consecutive-failure counter for each retry step, with one shared pause state for all three steps. after 20 consecutive transient failures at any step, that failed message is durably handed off to the next step (or the DLQ at step 3), then all three retry consumers for that destination pause together. messages already in steps 2 and 3 stay queued too; no step continues ordinary delivery attempts while paused. a non-transient response resets the failing step's consecutive-failure counter.
- pausing stops reads from all three retry steps, not writes into step 1. new messages keep accumulating durably in step 1 while the destination is paused, and cannot advance without being consumed and attempted. we use Kafka partition pause/resume while keeping the consumer polling, rather than unsubscribing.
- the main consumer has its own circuit breaker as well. when a destination's breaker is open we don't pause main-topic consumption, we stop ordinary delivery attempts to that destination and route its messages to step 1. this keeps the shared offset moving for the other destinations without bypassing a paused retry step. main offsets advance only after the retry write is durably acknowledged.
- after 2 minutes one coordinated half-open probe attempts a real message from any retry queue whose delay has elapsed. separate main-consumer probes are suppressed during the shared pause, so only this recovery probe contacts the paused destination. a transient failure leaves every retry step paused and the message queued for the next probe. a successful probe resumes all three steps and closes the main breaker. a permanent probe response sends that message to the DLQ and resumes all three steps because the destination is responding.
- on recovery all retry steps resume together with backpressure, so the backlog doesn't knock the service down again. the shared pause is scoped to the failed destination; healthy destinations continue normally.

::figure breaker One outage from start to drained. Change the outage length to see the probes line up differently, or drag across the timeline to scrub. The backlog numbers are illustrative.

## What we guarantee (and what we don't)

- **durable after ack** - once the producer says stored, the log is in Kafka (or committed in the outbox for logs that need processing).
- **at least once per destination** - every destination gets the log at least once. duplicates are possible, so we send the idempotency key and expect destinations to dedupe on it.
- **no ordering** - messages can arrive out of order. our use case doesn't need it.
- **outage tolerance** - a destination can be down for as long as our retention allows (7 days on the main topics, 14 days on retry and DLQ). DLQ data older than 10 days is archived to S3.

::figure retention Follow one log whose destination never comes back. It outlives the main topic in the DLQ, and moves to S3 before the DLQ retention would delete it.

## Now break all of it

Every figure above is one idea on its own. This is all of them running together: generators, producer pods, the outbox, Kafka, the retry topics, consumers and destinations.

::simulation

> [!TRY] Break it
> Messages flow left to right: generators send logs to the producer service, which writes them to Kafka (or the outbox when they need processing). Consumers read from Kafka and deliver to destinations. Try "Break something…" in the toolbar, then watch the retry topics, breakers and DLQ react. "Heal everything" brings it back.
