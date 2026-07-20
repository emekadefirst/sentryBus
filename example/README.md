# SentryBus Example — Hasura + Paystack + Blnk Integration

An example application demonstrating how to use [SentryBus](https://www.npmjs.com/package/sentrybus) as an integration bus between Hasura (real-time data layer), Paystack (payments), and Blnk (ledger).

## Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│  Paystack    │────────▶│  Elysia API  │────────▶│  Supabase        │
│  (payments)  │ webhook │  (:3005)     │  drizzle│  PostgreSQL      │
└──────────────┘         └──────┬───────┘         └────────┬─────────┘
                                │                          │
                                │ publish                  │ subscription
                                ▼                          ▼
                      ┌──────────────────┐        ┌──────────────┐
                      │  SentryBus       │◀───────│  Hasura Cloud│
                      │  (:8085)         │  event │  (GraphQL)   │
                      └────────┬─────────┘        └──────────────┘
                               │
                               ▼
                      ┌──────────────┐
                      │  Blnk Ledger │
                      │  (:5001)     │
                      └──────────────┘
```

## Stack

- **Runtime** — [Bun](https://bun.sh)
- **API Framework** — [Elysia](https://elysiajs.com)
- **ORM** — [Drizzle ORM](https://orm.drizzle.team) (PostgreSQL)
- **Validation** — [Zod](https://zod.dev) + Elysia TypeBox
- **Integration Bus** — [SentryBus](https://www.npmjs.com/package/sentrybus)
- **Database** — Supabase PostgreSQL (via pooler connection)
- **Real-time GraphQL** — Hasura Cloud
- **Ledger** — [Blnk](https://blnkfinance.com) (self-hosted via Docker)
- **Queue** — Redis + BullMQ (via SentryBus)

## Prerequisites

1. **Bun** (v1.0+)
   ```bash
   # Windows PowerShell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

2. **Docker + Docker Compose** — for running Redis, Blnk, Blnk's Postgres, and Typesense

3. **Supabase account** — for the app database (or any hosted Postgres)

4. **Hasura Cloud account** — for GraphQL subscriptions on your data

5. **Paystack test account** — for the secret key

## Installation

```bash
# From the project root
cd example
bun install
```

## Configuration

### 1. Environment variables

```bash
cp .env.sample .env
```

Fill in `.env` with your actual credentials:

```env
# Supabase Postgres (use the pooler connection for IPv4 compatibility)
DB_PORT=6543
DB_USER=postgres.YOUR_PROJECT_ID
DB_PASSWORD=YOUR_SUPABASE_PASSWORD
DB_NAME=postgres
DB_HOST=aws-0-eu-central-1.pooler.supabase.com

# SentryBus (used by your app to publish events)
PORT=8085
HOST=localhost
URL=http://localhost:8085

# Redis (shared between SentryBus and Blnk)
REDIS_USERNAME=default
REDIS_PASSWORD=supersecretpassword
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Blnk Ledger
BLNK_BASE_URL=http://localhost:5001
BLNK_API_KEY=your-custom-master-key-here
BLNK_WEBHOOK_SIGNING_SECRET=your-blnk-webhook-secret

# Zoho CRM (optional)
ZOHO_CRM_BASE_URL=https://www.zohoapis.com/crm/v6
ZOHO_CRM_TOKEN=your-zoho-crm-token

# Paystack
PAYSATCK_SECRET_KEY=sk_test_xxxxx
PAYSATCK_URL=https://api.paystack.co

# Hasura Cloud
HASURA_URL=https://your-project.hasura.app/v1/graphql
HASURA_ADMIN_SECRET=your-hasura-admin-secret
```

### 2. SentryBus adapter configs

The `bus/` directory holds SentryBus's own configuration. Values must be inline (SentryBus reads them literally, no env interpolation):

- `bus/env.config.toml` — Bus runtime (port, Redis credentials)
- `bus/blnk.config.toml` — Blnk adapter (baseUrl, credential, topics, retry policy)
- `bus/zoho-crm.config.toml` — Zoho adapter

**Note on `credentialKey`:** SentryBus treats this as the actual credential value (inline), not an env var name.

### 3. Blnk config

`blnk.json` at the project root configures the Blnk ledger service. Redis, Postgres, and Typesense hostnames use Docker service names.

## Running the Project

Order matters — services depend on each other.

### Step 1: Start the Docker stack

```bash
docker compose up -d
```

This starts:
- **Redis** on `localhost:6379` (shared by SentryBus and Blnk)
- **Blnk Postgres** on `localhost:5433`
- **Typesense** on `localhost:8108`
- **Blnk** on `localhost:5001`

Verify all containers are running:
```bash
docker compose ps
```

### Step 2: Run Blnk migrations (first-time setup only)

Blnk doesn't auto-migrate on startup. Run this once after the first `docker compose up`:

```bash
docker exec blnk blnk migrate up
```

You should see `Applied 37 migrations!`. Then restart Blnk to clear any pre-migration error loops:

```bash
docker compose restart blnk
```

### Step 3: Run your app database migrations

```bash
# Generate migration files from Drizzle schema
bun run makemigrations

# Apply migrations to Supabase
bun run migrate
```

### Step 4: Track tables in Hasura

Log into your Hasura Cloud console → Data tab → your database → `public` schema. Click **Track All** for the untracked tables (`products`, `orders`, `order_items`).

### Step 5: Start SentryBus

```bash
bunx sentrybus
```

You should see the ASCII banner and:
```
Services in bus:
────────────────────────────────────────
blnk-ledger  ● enabled
  → shipment.delivered, invoice.due, payment.initiated, payment.confirmed
zoho-crm  ● enabled
  → driver.onboarded, company.account.updated
────────────────────────────────────────
🚀 LISTENING  http://localhost:8085
[Redis] connected
```

### Step 6: Start the API server

In a new terminal:

```bash
bun run dev
```

The API runs on `http://localhost:3005` with Swagger docs at `http://localhost:3005/docs`.

## Payment Flow

1. **Client → POST /orders** with items and customer details
2. **Your API** creates the order in Supabase via Drizzle
3. **Your API** calls Paystack to initialize the payment
4. **Your API** publishes `payment.initiated` to SentryBus
5. **SentryBus** routes the event to Blnk, creating a ledger entry for the pending payment
6. **API returns** `{ order, payment: { url, reference } }` — client redirects to Paystack
7. **Paystack** processes payment, sends webhook to `/payments/webhook`
8. **Your API** verifies the signature, publishes `payment.confirmed` to SentryBus
9. **SentryBus** routes to Blnk, creating a ledger entry for the confirmed payment

Full audit trail in Blnk: both pending and confirmed payments recorded as ledger transactions.

## API Endpoints

### Products

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | List (paginated, `?search=`) |
| GET | `/products/:id` | Get by ID |
| POST | `/products` | Create |
| PUT | `/products/:id` | Update |
| DELETE | `/products/:id` | Delete |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List (paginated, `?search=`, `?status=`) |
| GET | `/orders/:id` | Get by ID (includes product details) |
| POST | `/orders` | Create order + initiate payment + publish to bus |
| PUT | `/orders/:id` | Update |
| DELETE | `/orders/:id` | Delete |

### Payments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/payments/webhook` | Paystack webhook receiver (HMAC verified) |

## Blnk API Access

Query ledger transactions directly:

```bash
# List all transactions
curl -H "X-Blnk-Key: your-custom-master-key-here" http://localhost:5001/transactions

# Get a specific transaction by reference
curl -H "X-Blnk-Key: your-custom-master-key-here" "http://localhost:5001/transactions/ref/YOUR_REFERENCE"

# List balances
curl -H "X-Blnk-Key: your-custom-master-key-here" http://localhost:5001/balances
```

## Project Structure

```
example/
├── bus/                              # SentryBus adapter configs
│   ├── env.config.toml               # Bus runtime (port, Redis)
│   ├── blnk.config.toml              # Blnk adapter
│   └── zoho-crm.config.toml          # Zoho adapter
├── src/
│   ├── configs/
│   │   └── env.ts                    # Environment variable loading
│   ├── data/
│   │   ├── db.ts                     # Drizzle DB connection
│   │   ├── dto.ts                    # Response DTOs
│   │   ├── models.ts                 # Drizzle table schemas
│   │   └── schema.ts                 # Zod validation schemas
│   ├── handlers/
│   │   ├── order.handler.ts          # Order routes
│   │   └── product.handler.ts        # Product routes
│   ├── libs/
│   │   ├── hasura/                   # Hasura GraphQL + subscription client
│   │   ├── http/                     # Generic FetchClient
│   │   └── paystack/                 # Paystack payment + webhook client
│   ├── payment/
│   │   ├── handler.ts                # Payment webhook route
│   │   ├── service.ts                # Payment orchestration
│   │   └── types.ts                  # Payment types
│   ├── repos/
│   │   ├── order.repository.ts       # Order data access
│   │   └── product.repository.ts     # Product data access
│   └── scripts/
│       └── migrate.ts                # Drizzle migration runner
├── blnk.json                         # Blnk ledger config
├── docker-compose.yml                # Redis + Blnk stack
├── drizzle.config.ts                 # Drizzle Kit config
├── index.ts                          # App entrypoint (Elysia server)
├── package.json
└── tsconfig.json
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start API with hot reload on `:3005` |
| `bun run build` | Compile for production |
| `bun run start` | Run production build |
| `bunx sentrybus` | Start the SentryBus integration bus on `:8085` |
| `bun run makemigrations` | Generate Drizzle migration files |
| `bun run migrate` | Apply migrations to Supabase Postgres |
| `bun run db:studio` | Open Drizzle Studio |
| `docker compose up -d` | Start Redis + Blnk + Typesense + Blnk Postgres |
| `docker compose down` | Stop the Docker stack |
| `docker exec blnk blnk migrate up` | Run Blnk's own schema migrations |

## Troubleshooting

**Blnk returns 401** — Check that `bus/blnk.config.toml`'s `credentialKey` matches the `server.secret_key` in `blnk.json`.

**Blnk returns "relation blnk.transactions does not exist"** — Run `docker exec blnk blnk migrate up`.

**Typesense 401 errors in Blnk logs** — Ensure `BLNK_TYPESENSE_KEY` env var in `docker-compose.yml` matches `TYPESENSE_API_KEY` on the Typesense service. Wipe the Typesense volume if the key was changed after first boot: `docker volume rm example_typesense_data`.

**SentryBus "Custom Id cannot contain :"** — Don't include colons in `correlationId` when publishing.

**Blnk returns 400 on transaction** — Your event payload doesn't match Blnk's expected `/transactions` schema. See `src/payment/service.ts` for the correct shape.

**Supabase DNS resolution fails** — Use the pooler connection (port 6543) instead of direct connection (port 5432).
