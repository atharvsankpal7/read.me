---
title: "Checksums: The Digital Fingerprint of Data"
subtitle: How TCP, UDP, PostgreSQL and DynamoDB make sure that the data sent was actually correct.
date: 2026-05-06
tags:
  - Networking
  - Databases
  - Reliability
---

We do a lot of data transfer over the network, and this data can be corrupted during transfer in the form of packet loss or file encoding failures due to different OSs. But how do we make sure that the data sent was actually correct?

The answer is very simple yet very powerful: it's a checksum.

## What is a checksum?

A [checksum](https://en.wikipedia.org/wiki/Checksum) is a small value calculated from a digital file or data packet to verify its integrity. It acts as a "digital fingerprint"; even a tiny change to the original data, such as a single flipped bit, will result in a completely different checksum value.

::figure fingerprint Four bytes and their CRC-32C. One flipped bit, and the checksum is a completely different value. Click any bit to flip it yourself.

It's used everywhere, from transport layer protocols like [TCP](https://www.rfc-editor.org/rfc/rfc9293#section-3.1) and [UDP](https://www.rfc-editor.org/rfc/rfc768), to complicated systems like [PostgreSQL](https://www.postgresql.org/docs/current/checksums.html), and even large distributed systems like [DynamoDB](https://www.usenix.org/conference/atc22/presentation/elhemali).

## The transport layer

We know that the transport layer uses checksums, but why?

TCP uses it to discard packets that have an invalid checksum and gets the correct data by using [Automatic Repeat Request (ARQ)](https://en.wikipedia.org/wiki/Automatic_repeat_request) to ensure data integrity.

UDP, however, simply drops the corrupted data in the case of a checksum failure. If a UDP packet carrying data for a multiplayer game or a voice call gets corrupted, the receiving application will try to read random, garbled bits as legitimate instructions. This can cause the app to crash instantly or behave erratically.

> [!IMPORTANT]
> Dropping a corrupted packet is always safer for system stability than processing bad data.

::figure transport Three packets, and the second one gets a flipped bit on the way. Switch between TCP, UDP and no checksum to see what the app gets.

## PostgreSQL

PostgreSQL uses checksums at various stages to ensure data durability. Data is stored in 8KB pages, and each page has a checksum written when the page is stored to disk. Even though checksums are configurable and disabled by default (historically to save performance, though there is negligible overhead during writes on modern hardware), it's highly recommended to turn them on.

::figure page One 8 KB page goes to disk, and a bad sector flips a bit in it. With checksums on, the read fails loudly. With checksums off, the query returns the corrupted row.

[WAL also uses checksums](https://www.postgresql.org/docs/current/wal-reliability.html). When replication is done for read replicas using WALs (as we discussed in [Optimizations Around Database](./database-scaling.html#the-write-ahead-log)), since we stream the WAL over the network, the replica replays the WAL only after verifying it isn't corrupted in transit.

::figure wal The primary streams four WAL records, and #43 is corrupted in transit. The replica replays only the records whose CRC matches, and gets #43 again.

## DynamoDB

DynamoDB uses checksums too. Since DynamoDB maintains three replicas of the same partition over different physical machines, we need to make sure that all of the partitions have the same data to ensure consistency. Because DynamoDB's main motive is to provide High Availability, the consistency is eventual. A scrub process periodically computes checksums for these live replicas and compares them against each other.

::figure merkle Three replicas of one partition, and replica C has one bad item. The roots of the Merkle trees show that C is different, and one level at a time shows where.

## Different strategies

But each of these systems implements checksums using different strategies:

- TCP uses a 16-bit [one's-complement checksum](https://www.rfc-editor.org/rfc/rfc1071) over the header + payload + a pseudo-header from IP.
- PostgreSQL uses [CRC-32C](https://en.wikipedia.org/wiki/Cyclic_redundancy_check) checksums.
- DynamoDB compares data using [Merkle trees](https://en.wikipedia.org/wiki/Merkle_tree) (which [Git also uses](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects) to detect file changes).
