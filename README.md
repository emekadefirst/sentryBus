# SentryBus

A general-purpose integration/service bus. Organizations plug their services in via config, dispatch events to the bus, and it routes each event to the right adapter — queuing and retrying automatically when the target service is down.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Environment Config (env.config.toml)](#environment-config-envconfigtoml)
  - [Adapter Config Files](#adapter-config-files)
  - [Adapter Config Reference](#adapter-config-reference)
- [Usage](#usage)
  - [Running the Bus](#running-the-bus)
  - [Publishing Events](#publishing-events)
  - [Health Check](#health-check)
- [Core Concepts](#core-concepts)
  - [Envelope](#envelope)
  - [Adapters](#adapters)
  - [Queue & Retry](#queue--retry)
  - [Circuit Breaker](#circuit-breaker)
  - [Middleware](#middleware)
- [Scripts](#scripts)
- [Extending SentryBus](#extending-sentrybus)
  - [Adding a New Adapter](#adding-a-new-adapter)
  - [Bidirectional Adapters (Webhooks)](#bidirectional-adapters-webhooks)
- [Design Decisions](#design-decisions)
- [Known Gaps](#known-gaps)
- [License](#license)

---

## Overview

SentryBus sits between your application and the third-party services it integrates with (CRM, ledger, notifications, analytics, etc.). Instead of each service in your platform making direct HTTP calls to external APIs — with its own retry logic, error handling, and failure modes — everything routes through SentryBus.

**The value proposition:**

- One place to configure connection details, retry policies, rate limits, and circuit breakers for every integration.
- Events are queued persistently. If Zoho is down, the message waits in Redis and retries on a configurable backoff schedule. No data is lost.
- Each adapter retries independently. A Blnk failure doesn't block Zoho dispatch for the same event.
- Circuit breakers prevent hammering a downed service. Once a threshold is crossed, the bus stops calling that service, probes periodically, and resumes automatically when it's healthy.

---

## Architecture

```
┌─────────────────┐       POST /publish        ┌──────────────────────────┐
│  Your API       │ ─────────────────────────▶  │  SentryBus (:8085)       │
│  (localhost:3000)│                            │                          │
└─────────────────┘                            │  ┌────────────────────┐  │
                                               │  │ Ingest (validate)  │  │
┌─────────────────┐       POST /publish        │  └────────┬───────────┘  │
│  Another Service│ ─────────────────────────▶  │           │              │
│  (localhost:4000)│                            │           ▼              │
└─────────────────┘                            │  ┌────────────────────┐  │
                                               │  │ Envelope (stamp)   │  │
                                               │  └────────┬───────────┘  │
                                               │           │              │
                                               │           ▼              │
                                               │  ┌────────────────────┐  │
                                               │  │ Router (fan-out)   │  │
                                               │  └────────┬───────────┘  │
                                               │           │              │
                                               │           ▼              │
                                               │  ┌────────────────────┐  │
                                               │  │ BullMQ (Redis)     │  │
                                               │  └────────┬───────────┘  │
                                               │           │              │
                                               │           ▼              │
                                               │  ┌────────────────────┐  │
                                               │  │ Dispatcher Worker  │  │
                                               │  │ (circuit breaker)  │  │
                                               │  └────────┬───────────┘  │
                                               └───────────┼──────────────┘
                                                           │
                              ┌─────────────────────────────┼──────────────────┐
                              │                             │                  │
                              ▼                             ▼                  ▼
                    ┌──────────────┐             ┌──────────────┐    ┌──────────────┐
                    │  Zoho CRM    │             │  Blnk Ledger │    │  Service N   │
                    └──────────────┘             └──────┬───────┘    └──────────────┘
                                                       │
                                                       │ webhook callback
                                                       ▼
                                               ┌──────────────────┐
                                               │ SentryBus        │
                                               │ /webhooks/blnk   │
                                               └──────────────────┘
```

---

## How It Works

1. **Publish** — Your service sends a `POST /publish` to SentryBus with a topic and payload.
2. **Envelope** — The bus wraps the event in a normalized envelope (adds `id`, `timestamp`, `correlationId`, `version`).
3. **Route** — The router looks up which adapters subscribe to that topic. One BullMQ job is created per adapter (independent retry).
4. **Queue** — Jobs sit in Redis. If Redis is healthy, dispatch happens near-instantly. If the target is down, jobs stay queued and retry on a backoff schedule.
5. **Dispatch** — The worker picks up a job, checks the circuit breaker, and makes the outbound HTTP call with the adapter's configured timeout and credentials.
6. **Retry or Dead-letter** — On failure, the circuit breaker records it. The job retries based on the adapter's retry policy (fixed/linear/exponential backoff with optional jitter). After max attempts, it's dead-lettered and logged.
7. **Webhook (bidirectional)** — Some services (like Blnk) call back with status updates. SentryBus receives those on configured webhook routes, translates them to internal events, and publishes them back onto the bus.

---

## Project Structure

```
sentryBus/
├── bus/                            # All config lives here
│   ├── env.config.toml             # Port, host, Redis credentials
│   ├── zoho-crm.config.toml       # Adapter: Zoho CRM
│   └── blnk.config.toml           # Adapter: Blnk Ledger
├── src/
│   ├── index.ts                    # Entrypoint — boot, server, worker
│   ├── configs/
│   │   ├── app.ts                  # App config (reads from env.config.toml)
│   │   ├── redis.ts                # Redis connection (reads from env.config.toml)
│   │   └── index.ts                # Barrel export
│   ├── core/
│   │   ├── adapters.ts             # Adapter registry (load, query by topic/name)
│   │   ├── circuitBreaker.ts       # Per-adapter in-process breaker
│   │   ├── dispatcher.ts           # BullMQ Worker — outbound dispatch
│   │   ├── envelop.ts              # Envelope schema + builder
│   │   ├── injest.ts               # HTTP handler for POST /publish
│   │   ├── middleares.ts           # Middleware: compose, logging, error boundary
│   │   └── router.ts              # Fan-out: envelope → per-adapter BullMQ jobs
│   ├── libs/
│   │   └── queue.ts                # BullMQ Queue + custom backoff strategy
│   ├── middleware/
│   │   └── index.ts                # Re-exports from core/middleares.ts
│   ├── schemas/
│   │   ├── envConfigSchemas.ts     # Zod schema for env.config.toml
│   │   └── serviceAdaptorSchemas.ts # Zod schema for adapter configs
│   └── utils/
│       ├── banner.ts               # Startup banner (ASCII art + service list)
│       ├── configFileReader.ts     # Parses a single TOML file (Bun native)
│       ├── envConfigReader.ts      # Loads + validates env.config.toml
│       ├── loader.ts               # Globs bus/*.config.toml (adapters only)
│       └── logger.ts               # Structured JSON logger with secret redaction
├── package.json
└── tsconfig.json
```

---

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Redis](https://redis.io) 6+

Quick Redis via Docker:

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine --requirepass supersecretpassword
```

---

## Installation

```bash
# From source
git clone https://github.com/emekadefirst/sentryBus.git
cd sentryBus
bun install

# Or install as a package
bun add -g sentrybus
```

---

## Configuration

All configuration lives in the `bus/` directory. No `.env` file needed.

### Environment Config (env.config.toml)

`bus/env.config.toml` holds the bus's own runtime settings and Redis credentials:

```toml
PORT = 8085
HOST = "localhost"
URL = "http://localhost:8085"

REDIS_USERNAME = "default"
REDIS_PASSWORD = "supersecretpassword"
REDIS_HOST = "127.0.0.1"
REDIS_PORT = 6379
```

| Field | Type | Description |
|-------|------|-------------|
| `PORT` | number | HTTP server port |
| `HOST` | string | Bind address |
| `URL` | string (URL) | Public base URL |
| `REDIS_USERNAME` | string | Redis ACL username |
| `REDIS_PASSWORD` | string | Redis password |
| `REDIS_HOST` | string | Redis host |
| `REDIS_PORT` | number | Redis port |

Validated by Zod at boot — a typo or missing field fails immediately with a clear error message, not silently at runtime.

### Adapter Config Files

Each integration gets its own `*.config.toml` file in `bus/`. The bus reads all adapter configs at boot, validates each against the Zod schema, and fails loudly if any are malformed.

**Example: `bus/zoho-crm.config.toml`**

```toml
name = "zoho-crm"
enabled = true
protocol = "http"
baseUrl = "https://www.zohoapis.com/crm/v6"
timeoutMs = 5000
credentialKey = "ZOHO_CRM_TOKEN"
topics = ["driver.onboarded", "company.account.updated"]
envelopeVersion = "1.0"

[rateLimit]
burst = 20
refillPerSecond = 5

[retry]
maxAttempts = 5
backoff = "exponential"
baseDelayMs = 500
jitter = true

[circuitBreaker]
failureThreshold = 5
windowMs = 60000
cooldownMs = 30000
```

**Example: `bus/blnk.config.toml`** (bidirectional — includes webhook fields)

```toml
name = "blnk-ledger"
enabled = true
protocol = "http"
baseUrl = "https://ledger.internal.example.com"
timeoutMs = 8000
credentialKey = "BLNK_API_KEY"
topics = ["shipment.delivered", "invoice.due"]
envelopeVersion = "1.0"
webhookRoute = "/webhooks/blnk"
webhookSecret = "BLNK_WEBHOOK_SIGNING_SECRET"

[rateLimit]
burst = 10
refillPerSecond = 2

[retry]
maxAttempts = 8
backoff = "exponential"
baseDelayMs = 1000
jitter = true

[circuitBreaker]
failureThreshold = 3
windowMs = 60000
cooldownMs = 45000
```

### Adapter Config Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Unique adapter identifier |
| `enabled` | boolean | ✓ | Toggle without deleting config |
| `protocol` | `"http"` \| `"sse"` \| `"ws"` | ✓ | Transport protocol |
| `baseUrl` | string (URL) | ✓ | Target service base URL |
| `timeoutMs` | number | ✓ | Request timeout in milliseconds |
| `credentialKey` | string | ✓ | Env var name holding the credential |
| `topics` | string[] | ✓ | Event types this adapter subscribes to |
| `envelopeVersion` | string | ✓ | Envelope schema version this adapter expects |
| `webhookRoute` | string | — | Inbound webhook path (bidirectional adapters) |
| `webhookSecret` | string | — | Env var name for webhook signature verification |
| `rateLimit.burst` | number | ✓ | Token bucket max burst |
| `rateLimit.refillPerSecond` | number | ✓ | Token refill rate |
| `retry.maxAttempts` | number | ✓ | Maximum delivery attempts |
| `retry.backoff` | `"fixed"` \| `"linear"` \| `"exponential"` | ✓ | Backoff strategy |
| `retry.baseDelayMs` | number | ✓ | Base delay between retries |
| `retry.jitter` | boolean | ✓ | Add randomness to prevent thundering herd |
| `circuitBreaker.failureThreshold` | number | ✓ | Consecutive failures before opening |
| `circuitBreaker.windowMs` | number | ✓ | Time window for failure counting |
| `circuitBreaker.cooldownMs` | number | ✓ | Wait before health probe after opening |

---

## Usage

### Running the Bus

```bash
# Development (auto-restart on file changes)
bun run dev

# Production
bun run start

# If installed globally
sentrybus
```

On startup you'll see:

```
  ███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗
  ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝
  ███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝
  ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝
  ███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║
  ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝
  ██████╗ ██╗   ██╗███████╗
  ██╔══██╗██║   ██║██╔════╝
  ██████╔╝██║   ██║███████╗
  ██╔══██╗██║   ██║╚════██║
  ██████╔╝╚██████╔╝███████║
  ╚═════╝  ╚═════╝ ╚══════╝

  by Victor Chibuogwu Chukemeka aka Emekadefirst  • July 2026
  ✉  emekadefirst@gmail.com

  Services in bus:
  ────────────────────────────────────────
  zoho-crm  ● enabled
    → driver.onboarded, company.account.updated
  blnk-ledger  ● enabled
    → shipment.delivered, invoice.due
  ────────────────────────────────────────

   🚀 LISTENING  http://localhost:8085
```

### Publishing Events

Any service in your infrastructure can publish events to the bus:

```bash
curl -X POST http://localhost:8085/publish \
  -H "Content-Type: application/json" \
  -d '{
    "type": "order.created",
    "correlationId": "ord-12345",
    "payload": {
      "orderId": "ord-12345",
      "customerId": "cust-789",
      "amount": 150.00,
      "currency": "NGN"
    }
  }'
```

**Response (202 Accepted):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "correlationId": "ord-12345",
  "dispatchedTo": 2
}
```

| Field | Meaning |
|-------|---------|
| `id` | Bus-assigned envelope UUID |
| `correlationId` | Your correlation ID (or auto-generated if omitted) |
| `dispatchedTo` | Number of adapters the event was routed to |

**Publish Request Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✓ | Event topic (e.g. `"order.created"`) |
| `correlationId` | string | — | Your tracking ID (UUID auto-generated if omitted) |
| `payload` | object | ✓ | Arbitrary event data |

### Health Check

```bash
curl http://localhost:8085/health
```

```json
{ "status": "ok" }
```

---

## Core Concepts

### Envelope

Every event flowing through SentryBus is wrapped in a normalized envelope. The producer supplies only the intent (`type` + `payload`); the bus stamps bookkeeping fields.

```typescript
{
  id: "uuid",              // assigned by the bus
  type: "order.created",   // topic
  version: "1.0",          // envelope schema version
  correlationId: "...",    // tracing across systems
  timestamp: "ISO-8601",   // when the bus received it
  payload: { ... }         // your event data
}
```

### Adapters

An adapter represents one external service integration. At boot, SentryBus loads all `bus/*.config.toml` files (excluding `env.config.toml`), validates each against the Zod schema, and builds an in-memory registry. Only adapters with `enabled = true` participate in routing.

### Queue & Retry

BullMQ backed by Redis for persistent job queuing:

- **Per-adapter jobs** — Each adapter gets its own job. A Blnk failure retries independently of Zoho.
- **Deduplication** — Job ID is `{envelopeId}:{adapterName}`. Same event never double-queues.
- **Custom backoff** — Reads each adapter's retry policy directly from config (fixed/linear/exponential + jitter).
- **Dead-lettering** — After `maxAttempts` exhausted, logged at error level.

### Circuit Breaker

In-process, per-adapter state machine:

| State | Behavior |
|-------|----------|
| **Closed** | Normal — all dispatches go through |
| **Open** | Service down — fail fast, no network call |
| **Half-open** | Cooldown elapsed — one probe allowed |

### Middleware

Minimal `compose` utility for Bun.serve (no framework dependency):

- **withRequestLog** — method, path, status, duration
- **withErrorBoundary** — catches unhandled errors, returns clean 500

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start with `--watch` (auto-restart on changes) |
| `bun run start` | Production start |
| `bun run build` | Compile to `dist/index.js` |
| `bun run bundle` | Compile + minify for distribution |

---

## Extending SentryBus

### Adding a New Adapter

1. Create `bus/<service-name>.config.toml` with the required fields.
2. Set the credential as an environment variable (the value referenced by `credentialKey`).
3. Restart the bus. Done.

No code changes needed for outbound-only integrations.

### Bidirectional Adapters (Webhooks)

For services that call back (like Blnk):

1. Add `webhookRoute` and `webhookSecret` to the adapter config.
2. Implement a route handler that verifies the signature and translates the callback into an internal event.
3. Publish it back onto the bus — downstream consumers pick it up.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **TOML config over .env** | Validated by Zod at boot. Typed, structured, fails loudly. No silent empty-string bugs. |
| **Choreography over orchestration** | Bus moves envelopes, not business logic. |
| **Redis + BullMQ only** | Multi-broker abstraction is a real problem. Commit to one, keep interfaces clean. |
| **BullMQ over hand-rolled queues** | Atomic state transitions + stalled-job recovery are hard to get right. |
| **One file per adapter** | Bad edit affects one integration, not all. Clean diffs. |
| **Zod as single source of truth** | Types derived via `z.infer`. No drift. |
| **Circuit breaker in-process** | Correct for single instance. Move to Redis when multi-instance is needed. |
| **Bun runtime** | Native TOML, fast HTTP, built-in bundler. No extra dependencies for basics. |

---

## Known Gaps

- **Adapter dispatch is generic** — Currently a plain `POST` + `Bearer` header. Real adapters need per-service request shaping.
- **Webhook receiver not implemented** — Config supports it, route handler doesn't exist yet.
- **Rate limiting not enforced** — Config defines token bucket params but the limiter isn't wired in.
- **No hot-reload** — Config changes require restart. Deliberate for now.
- **Single instance only** — Circuit breaker is in-memory.

---

## Publishing

SentryBus is published to npm and installable via any package manager:

```bash
# Install globally
bun add -g sentrybus
npm install -g sentrybus

# Run without installing
bunx sentrybus
npx sentrybus
```

Requires Bun runtime (`bun.sh`) to execute.

---

## License

MIT

---

Built by **Victor Chibuogwu Chukemeka** ([@emekadefirst](https://github.com/emekadefirst))  
Contact: emekadefirst@gmail.com
