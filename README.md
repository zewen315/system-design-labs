# System Design Labs

> Learn System Design by building the systems you use every day.

Most System Design resources focus on architecture diagrams.

This repository takes a different approach.

Instead of discussing how Twitter or YouTube *could* work, each lab implements a simplified but runnable version that demonstrates the core architectural ideas behind modern distributed systems.

Every project can be started locally with Docker Compose, explored, modified, and intentionally broken to better understand the trade-offs behind real-world system design.

The goal is not to reproduce production infrastructure.

The goal is to understand **why these systems are designed the way they are.**

---

# Projects

Each lab is inspired by a classic System Design interview problem.

```text
system-design-labs/

├── dropbox/
├── google/
├── ticketmaster/
├── twitter/
├── uber/
└── whatsapp/
```

Rather than implementing every feature, each project focuses on the architectural decisions that make these systems scalable.

---

# What You'll Learn

Across these labs you'll encounter topics such as:

- Caching
- Message Queues
- Event-Driven Architecture
- Background Workers
- Object Storage
- WebSockets
- Search Indexes
- Geo-spatial Queries
- Feed Generation
- Pagination
- Idempotency
- Retry Strategies
- Rate Limiting
- Database Partitioning
- Horizontal Scaling
- Eventual Consistency

Instead of learning these concepts in isolation, you'll see how they work together inside real systems.

---

# Learning Philosophy

Every project begins with a deceptively simple question.

For example:

- How does Twitter generate your home timeline?
- How does YouTube process a newly uploaded video?
- How does Dropbox synchronize files across devices?
- How does WhatsApp guarantee message delivery?
- How does Uber find nearby drivers?

By implementing simplified versions yourself, you'll discover why distributed systems rely on caches, asynchronous processing, partitioning, replication, and many other techniques.

---

# Project Structure

Each lab follows a similar layout.

```text
twitter/

├── README.md
├── design.md
├── services/
├── simulation/
├── tests/
└── docker-compose.yml
```

Every project is designed to run locally while preserving the interactions between multiple services.

---

# Design Principles

Every lab is:

- Runnable on a single machine
- Composed of multiple microservices
- Small enough to understand in a few hours
- Easy to modify and experiment with
- Focused on architectural ideas instead of production complexity

These are educational implementations, not production systems.

---

# How to Learn

For each lab:

1. Understand the product requirements.
2. Design the system.
3. Build a minimal implementation.
4. Generate realistic traffic.
5. Observe system behavior.
6. Introduce failures.
7. Iterate on the design.

The emphasis is not on writing thousands of lines of code.

It's on understanding why each architectural decision exists.

---

# Who Is This For?

This repository is intended for:

- Software engineers preparing for System Design interviews
- Backend engineers interested in distributed systems
- Students who learn best by building
- Anyone curious about how internet-scale systems work

---

# Related Project

This repository focuses on **application systems**.

A companion repository, **Infra Lab**, explores the infrastructure behind these applications, including traffic management, deployment, resource delivery, observability, and platform services.

Together they demonstrate both the application layer and the infrastructure layer of modern distributed systems.

---

# Disclaimer

These projects intentionally omit many production concerns, including security, compliance, authentication, operational tooling, and large-scale optimizations.

Their purpose is educational: to illustrate the architectural ideas that appear repeatedly in real-world distributed systems and technical interviews.

---

> *"The best way to understand a distributed system is to build one."*