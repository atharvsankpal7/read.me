---
title: Concurrency and Parallelism
subtitle: Both are used for increasing efficiency and throughput, but they are not the same thing. Concurrency improves utilization; parallelism improves raw execution capacity.
date: 2026-04-25
tags:
  - Operating Systems
  - Performance
  - Backend
---

Concurrency and parallelism, both are used for increasing efficiency and throughput, right? I've seen a lot of resources confuse between these while reading some articles; but [it's not like that](https://go.dev/blog/waza-talk).

## Concurrency

Concurrency is used when we want to run multiple processes on a single processing unit. It's ideal when the system is [I/O bound](https://en.wikipedia.org/wiki/I/O_bound), like processes waiting for external services to respond, like a database. So while process A is waiting for the database to respond, our CPU sits idle, and we can use concurrency control to execute process B in the meantime.

But it's not guaranteed that as soon as I/O is complete for process A, it will be returned to the execution. (It's on the [scheduler](https://en.wikipedia.org/wiki/Scheduling_(computing)) to decide that. We'll not go into that rabbit hole for now, but process A is in the ready queue at the OS level.)

So concurrency increases the efficiency of the CPU, letting it do more in less time.

::figure concurrency One CPU and two processes. Process A waits for the database in the middle. Run them one at a time and the CPU sits idle; run them concurrently and process B fills the gap.

## Parallelism

Parallelism, however, is used when we want to do multiple tasks at the same time and we have multiple processing units at our disposal to do so. It's usually ideal for [CPU-bound](https://en.wikipedia.org/wiki/CPU-bound) tasks like parsing and validating CSVs. If we have a backend server, we can spawn subprocesses to handle parsing and validation for each CSV (given we have enough of other resources like RAM).

Parallelism is also dependent on the host machine it's running on. If we have a 4 vCPU machine, we can parse 3 CSVs ideally (keeping 1 vCPU for handling the other client requests). Else it will create overhead that has to be handled by the OS, which will defeat the purpose of doing the optimization in the first place. So we can say parallelism increases the throughput of the system.

::figure parallelism A 4 vCPU machine parses CSVs in subprocesses while it serves client requests. Compare 3 CSVs with 6. The timings are illustrative.

> [!IMPORTANT]
> Concurrency improves utilization; parallelism improves raw execution capacity.
>
> Real systems often use both together.
