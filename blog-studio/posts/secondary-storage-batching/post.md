---
title: Secondary Storages and Optimizations Around Them
subtitle: Why related data stored close together is faster to access, and why batch processing is so foundational in modern systems.
date: 2026-08-20
tags:
  - Storage
  - Databases
  - Performance
---

> [!NOTE]
> This article is a summary of what we discussed in [this video](https://www.youtube.com/live/Spo8hGB1ZZU?si=LMQ_54Y3b1aD7l2L).

## HDDs and Pages

An HDD stores data on rotating disks. A physical read/write head has to move to the location where the required data is stored.

The smallest part of the store is the Page and data is divided into fixed-size pages, commonly 4 KB or 8 KB.

When the system needs something from secondary storage even 1 bit of data, it usually loads the entire relevant page into main memory rather than reading a few bytes directly.

::figure pages The program asks for 1 bit of `p3`. The head moves to `p3` and the whole 4 KB page goes to main memory, so the next byte in that page is already there.

> [!IMPORTANT] Core Insight
> If related data is stored close together, we can access it more efficiently. (That's why array sequential scan is faster than linked list as we usually have a cache hit.)

## Why Random Access Is Expensive

Imagine a large file stored continuously on a disk. Reading it is relatively efficient because the disk can move through the data sequentially.

Now imagine the same amount of data scattered across many different locations. The disk has to keep moving between those locations, and on an HDD, this physical movement is expensive cause you can't fight physics.

- **Sequential access** → fewer movements → better performance (and we might actually have data already present in the main memory)
- **Random access** → more movements → worse performance (more context switch is also needed; page fault can also happen adding more overhead)

::figure access The same 8 blocks of data, read once from one place and once from 8 places. Flip the layout and count how far the head has to move.

This is one reason databases try to organize and access data efficiently. For example, a database can know the physical locations of pages and process them in an order that reduces unnecessary movement. PostgreSQL's bitmap scan is one example of an approach that can help with this kind of access pattern.

## The Same Idea Applies to Writes

The same problem exists when writing data. Imagine a server generating logs continuously. If every log is immediately written to disk, we repeatedly perform:

```
Memory → Disk → Memory → Disk → Memory → Disk
```

Each operation has some overhead. Instead, we can temporarily keep multiple logs in memory and write them together.

For example, 100 small writes can become 1 larger write. The amount of data may be the same, but the number of expensive operations is much smaller. This is the basic idea behind batch processing.

::figure batch The same 10 logs, twice. The top server writes every log to disk right away. The bottom server keeps them in memory and writes them together.

## What Is Batch Processing?

Batch processing means collecting multiple operations or pieces of data and processing them together instead of handling each one individually.

Just like a school bus: instead of every student taking a separate vehicle, a school bus waits for multiple students and transports them together. Some students have to wait, but the overall number of trips is drastically reduced. Computer systems make this exact same trade-off.

## Where Do We See This?

Batch processing appears in many systems:

- **Databases:** Perform many operations in batches to reduce I/O overhead. Write-ahead logging is one example where changes can be handled efficiently while still providing durability.
- **Kafka:** Uses an append-oriented storage model. Instead of treating every message as an entirely separate disk operation, data can be written and processed in larger batches. This helps Kafka achieve high throughput.
- **SSDs:** While SSDs don't have moving parts (making random access much faster), they still have internal constraints like NAND flash, controllers, caching, and garbage collection mechanisms. Controllers receive multiple requests and optimize how they are handled internally, meaning batching or parallely performing the read operation and intelligent request scheduling still improve performance.

## But Batching Is Not Always Better

There is always a trade-off. Suppose we wait until we have 100 items before writing them:

- **Data Loss Risk:** What happens if we only have 98 items and the machine suddenly loses power? Those 98 items may still be sitting in memory and could be lost.
- **Latency:** If the first item arrives now but we wait for 99 more items, the first item has to wait.

::figure tradeoff A buffer that writes to disk at 10 logs. Cut the power at 8 logs and see what is lost, or keep the power on and see how long the first log waits.

So batch processing generally gives us higher throughput, but potentially higher latency. We just have to choose which tradeoff can our system handle.

## When Should We Avoid Batching?

Batching is not ideal when an operation needs to happen immediately. For example, when you send a chat message to someone, you don't want the system to wait until it has 100 messages before sending yours. For real-time systems, latency is often more important than maximum throughput.

## The Bigger Idea

The important lesson isn't just "batching is faster." The bigger idea is:

> When an operation is expensive, doing many small operations individually can be much more expensive than combining them.

This engineering principle appears everywhere:

- Database writes
- Log systems
- Kafka
- SSD controllers
- Network requests
- File systems
- Data processing systems

Even though HDDs and SSDs work very differently, the core principle remains: reduce unnecessary work, move data efficiently, and process multiple operations together when possible. That is the real reason batch processing is so foundational in modern systems.
