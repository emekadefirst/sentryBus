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
  - [Environment Variables](#environment-variables)
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
├── bus/                          # Adapter config files (one per integration)
│   ├── zoho-crm.config.toml
│   └── blnk.config.toml
├── src/
│   ├── index.ts                  # Entrypoint — server, worker, adapter loading
│   ├── configs/
│   │   ├── app.ts                # App config (port, host, env)
│   │   ├── env.ts                # requireEnv + assertEnvComplete
│   │   ├── index.ts              # Barrel export
│   │   └── redis.ts              # Redis/BullMQ connection
│   ├── core/
│   │   ├── adapters.ts           # Adapter registry (load, query by topic/name)
│   │   ├── circuitBreaker.ts     # Per-adapter in-process breaker
│   │   ├── dispatcher.ts         # BullMQ Worker — outbound dispatch
│   │   ├── envelop.ts            # Envelope schema + builder
│   │   ├── injest.ts             # HTTP handler for POST /publish
│   │   ├── middleares.ts         # Middleware: compose, logging, error boundary
│   │   └── router.ts             # Fan-out: envelope → per-adapter BullMQ jobs
│   ├── libs/
│   │   └── queue.ts              # BullMQ Queue + custom backoff strategy
│   ├── middleware/
│   │   └── index.ts              # Re-exports from core/middleares.ts
│   ├── schemas/
│   │   └── serviceAdaptor.ts     # Zod schema for adapter config validation
│   └── utils/
│       ├── configFileReader.ts   # Parses a single TOML file (Bun native)
│       ├── loader.ts             # Globs bus/*.config.toml
│       └── logger.ts             # Structured JSON logger with secret redaction
├── .env                          # Environment variables (never committed)
├── package.json
└── tsconfig.json
```

---

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Redis](https://redis.io) 6+ (or Docker: `docker run -d --name redis -p 6379:6379 redis:7-alpine --requirepass <password>`)
- Node.js is **not** required — this runs on Bun's runtime

---

## Installation

```bash
git clone https://github.com/emekadefirst/serviceBus.git
cd serviceBus
bun install
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=8085
HOST=localhost
NODE_ENV=dev
VERSION=v1
URL=http://localhost:8085

REDIS_USERNAME=default
REDIS_PASSWORD=supersecretpassword
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `8085` |
| `HOST` | Bind address | `0.0.0.0` |
| `NODE_ENV` | Environment (`dev`, `staging`, `prod`, `test`) | `dev` |
| `VERSION` | API version prefix | `v1` |
| `URL` | Public base URL | `http://localhost:8085` |
| `REDIS_USERNAME` | Redis ACL username | — |
| `REDIS_PASSWORD` | Redis password | — |
| `REDIS_HOST` | Redis host | — |
| `REDIS_PORT` | Redis port | — |

### Adapter Config Files

Each integration gets its own file in the `bus/` directory. The bus reads all `*.config.toml` files at boot, validates each against the Zod schema, and fails loudly if any are malformed.

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
| `credentialKey` | string | ✓ | Env var name holding the credential (never the credential itself) |
| `topics` | string[] | ✓ | Event types this adapter subscribes to |
| `envelopeVersion` | string | ✓ | Envelope schema version this adapter expects |
| `webhookRoute` | string | — | Inbound webhook path (for bidirectional adapters) |
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
```

Output:
```
{"time":"2026-07-19T10:00:00.000Z","level":"info","msg":"adapters loaded","count":2,"names":["blnk-ledger","zoho-crm"]}
service bus listening on http://localhost:8085/
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
| `type` | string | ✓ | Event topic (e.g. `"order.created"`, `"driver.onboarded"`) |
| `correlationId` | string | — | Your tracking ID (auto-generated UUID if omitted) |
| `payload` | object | ✓ | Arbitrary event data |

### Health Check

```bash
curl http://localhost:8085/health
```

```json
{ "status": "ok", "env": "dev" }
```

---

## Core Concepts

### Envelope

Every event flowing through SentryBus is wrapped in a normalized envelope. The producer supplies only the intent (`type` + `payload`); the bus stamps bookkeeping fields (`id`, `timestamp`, `version`, `correlationId`).

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

An adapter represents one external service integration. At boot, SentryBus loads all `bus/*.config.toml` files, validates each against the Zod schema, and builds an in-memory registry. Only adapters with `enabled = true` participate in routing.

The adapter registry supports two queries:
- `adaptersForTopic(topic)` — which adapters care about this event type?
- `getAdapter(name)` — look up a specific adapter by name

### Queue & Retry

SentryBus uses BullMQ backed by Redis for persistent job queuing. Key behaviors:

- **Per-adapter jobs** — Each adapter gets its own job for the same envelope. A Blnk failure retries independently of a Zoho dispatch that already succeeded.
- **Deduplication** — Job ID is `{envelopeId}:{adapterName}`, so even if the producer retries the original HTTP request, the same event never double-queues for the same adapter.
- **Custom backoff** — A single `backoffStrategy` function reads each adapter's own retry policy (fixed/linear/exponential + jitter), so behavior matches exactly what's declared in the config.
- **Dead-lettering** — After `maxAttempts` exhausted, the job is dead-lettered and logged at error level.

### Circuit Breaker

An in-process, per-adapter state machine with three states:

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation — all dispatches allowed |
| **Open** | Service is down — dispatches fail fast (no network call), retries via BullMQ backoff |
| **Half-open** | Cooldown elapsed — exactly one probe request allowed through |

Transitions:
- `closed → open`: consecutive failures ≥ `failureThreshold` within `windowMs`
- `open → half-open`: `cooldownMs` has elapsed since opening
- `half-open → closed`: probe succeeds
- `half-open → open`: probe fails

### Middleware

Bun.serve has no built-in middleware chain. SentryBus provides a minimal `compose` utility:

- **withRequestLog** — Logs method, path, status, and duration for every request.
- **withErrorBoundary** — Catches unhandled errors and returns a clean 500 instead of crashing.

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
2. Add the credential to your `.env` (the value of `credentialKey`).
3. Restart the bus — it validates and loads the new adapter automatically.

That's it for outbound-only integrations. No code changes needed.

### Bidirectional Adapters (Webhooks)

For services that call back (like Blnk's async transaction confirmations):

1. Add `webhookRoute` and `webhookSecret` to the adapter's config.
2. Implement a route handler in `src/index.ts` that:
   - Verifies the webhook signature
   - Translates the callback into an internal event type
   - Publishes it back onto the bus via the same `/publish` flow
3. The platform's own consumer picks up the resulting event.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Choreography over orchestration** | The bus moves envelopes, not business logic. No central workflow engine that becomes a monolith. |
| **Redis + BullMQ only** | A true multi-broker abstraction (Kafka + Redis + RabbitMQ) is a real engineering problem. Committed to one for now, interfaces are clean enough to add another later. |
| **BullMQ over hand-rolled queues** | Atomic job state transitions (Lua scripts) and stalled-job recovery are genuinely hard to get right. Duplicate dispatch = duplicate ledger entries. |
| **Config over code** | Connection details, policies, and bindings live in TOML. Transformation logic stays in typed handler code. |
| **One file per adapter** | A bad TOML edit affects one integration, not all of them. Clean git diffs. No merge conflicts. |
| **Zod schema as single source of truth** | TypeScript type is derived via `z.infer`. No hand-written `.d.ts` that can drift. |
| **Circuit breaker in-process** | Simpler than Redis-backed. Correct while running as a single instance. Move to Redis only when multi-instance is needed. |
| **Bun runtime** | Iteration speed, native TOML parsing, fast HTTP server. The bus is I/O-bound, not CPU-bound. |

---

## Known Gaps

- **Adapter dispatch is generic** — Currently a plain `POST` + `Bearer` header. Real adapters need per-service request shaping (Zoho OAuth flow, Blnk transaction payload format).
- **Webhook receiver not implemented** — Config supports `webhookRoute`/`webhookSecret` but no route handler exists yet.
- **Rate limiting not enforced** — Config defines `rateLimit` per adapter but the token bucket isn't wired into the dispatcher yet.
- **No hot-reload** — Config changes require a restart. Deliberate at this stage.
- **Single instance only** — Circuit breaker state is in-memory. Multi-instance deployment would need shared state in Redis.

---

## License

MIT
