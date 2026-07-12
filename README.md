# System Design Labs

> Learn System Design by building, experimenting, and breaking things.

Most System Design resources explain **what** a system looks like.

This project focuses on **why** those design decisions exist.

Instead of reading another architecture diagram, you can run a simplified implementation locally, generate traffic, inject failures, and observe how the system behaves.

The goal is **not** to build production-ready services.

The goal is to understand the core ideas behind modern distributed systems through small, self-contained experiments.

---

## Philosophy

Every project should answer questions like:

* Why do we need Redis?
* Why do we need Kafka?
* Why can duplicate messages happen?
* Why does cache improve latency?
* Why can overselling occur?
* Why is idempotency important?
* Why do we need distributed locks?
* Why is cursor pagination preferred over offset pagination?

Reading about these concepts is helpful.

Seeing them happen is much more memorable.

---

## What You'll Find

Each lab focuses on a single System Design interview problem.

Examples include:

* URL Shortener
* Rate Limiter
* News Feed
* Chat Service
* Ticket Booking
* File Storage
* Web Crawler
* Notification Service
* Video Streaming
* Ad Click Aggregator

Every lab is intentionally kept small so the important ideas remain easy to understand.

---

## Repository Structure

```text
system-design-playground/
├── url-shortener/
├── rate-limiter/
├── news-feed/
├── ticket-booking/
├── chat-service/
├── file-storage/
└── shared/
```

Each lab follows the same structure:

```text
lab/
├── README.md
├── design.md
├── app/
├── simulation/
├── tests/
└── docker-compose.yml
```

---

## What Each Lab Demonstrates

Each implementation highlights one or more core System Design concepts, such as:

* Caching
* Message Queues
* Event-Driven Architecture
* Idempotency
* Retry Strategies
* Optimistic Locking
* Distributed Locks
* Horizontal Scaling
* Database Partitioning
* Consistency Trade-offs
* Background Workers
* Pagination Strategies
* Rate Limiting

The implementation is intentionally simplified so you can focus on the architectural ideas instead of production complexity.

---

## Design Principles

Every lab is:

* Small enough to understand in a few hours
* Runnable on a single machine using Docker Compose
* Structured like a distributed system with multiple services
* Easy to modify and experiment with
* Focused on one important design problem

The emphasis is on understanding **building blocks**, not recreating large-scale production systems.

---

## Learning Approach

For every case study:

1. Understand the requirements.
2. Design the architecture.
3. Build a minimal working implementation.
4. Generate traffic and observe the behavior.
5. Introduce failures and edge cases.
6. Improve the design.
7. Reflect on the trade-offs.

---

## Who Is This For?

This repository is intended for:

* Software engineers preparing for System Design interviews
* Backend engineers learning distributed systems
* Students who prefer learning by building
* Anyone curious about how large-scale systems work

---

## Disclaimer

These implementations are educational toy systems.

Many production concerns are intentionally omitted, including security, observability, deployment, multi-region replication, compliance, and operational tooling.

The objective is to understand the fundamental concepts that appear repeatedly in real-world distributed systems and technical interviews.

---

## Contributing

Suggestions, improvements, and new lab ideas are always welcome.

If there's a System Design problem you'd like to see implemented, feel free to open an issue or submit a pull request.

---

> *"The best way to understand a distributed system is to build one, break it, and fix it."*

