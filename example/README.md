# SentryBus Example — Hasura + Paystack + Blnk Integration

An example application demonstrating how to use [SentryBus](https://www.npmjs.com/package/sentrybus) as an integration bus between Hasura (real-time data layer), Paystack (payments), and Blnk (ledger) services.

## Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│  Paystack    │────────▶│  Elysia API  │────────▶│  PostgreSQL      │
│  (payments)  │ webhook │  (:3000)     │  drizzle│  (orders, etc.)  │
└──────────────┘         └──────┬───────┘         └────────┬─────────┘
                                │                          │
                                │ publish                  │ subscription
                                ▼                          ▼
                      ┌──────────────────┐        ┌──────────────┐
                      │  SentryBus       │◀───────│  Hasura      │
                      │  (:8085)         │  event │  (GraphQL)   │
                      └────────┬─────────┘        └──────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │  Blnk Ledger │      │  Zoho CRM    │
          └──────────────┘      └──────────────┘
```

## Prerequisites

Before running this project, ensure you have the following installed:

1. **Bun** (v1.0+) — JavaScript runtime
   ```bash
   # Install Bun (Windows via PowerShell)
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

2. **PostgreSQL** (v14+) — Application database
   ```bash
   # Via Docker
   docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=user -e POSTGRES_DB=exampledb postgres:16-alpine
   ```

3. **Redis** (v6+) — Required by SentryBus for job queuing
   ```bash
   # Via Docker
   docker run -d --name redis -p 6379:6379 redis:7-alpine --requirepass supersecretpassword
   ```

4. **Hasura** (v2+) — Real-time GraphQL engine (connects to the same PostgreSQL)
   ```bash
   # Via Docker
   docker run -d --name hasura -p 8080:8080 \
     -e HASURA_GRAPHQL_DATABASE_URL=postgresql://postgres:user@host.docker.internal:5432/exampledb \
     -e HASURA_GRAPHQL_ADMIN_SECRET=your-hasura-admin-secret \
     -e HASURA_GRAPHQL_ENABLE_CONSOLE=true \
     hasura/graphql-engine:v2.40.0
   ```

## Installation

```bash
# Clone and enter the project
cd example

# Install dependencies
bun install
```

## Configuration

### 1. Environment Variables

Copy the sample and fill in your values:

```bash
cp .env.sample .env
```

Edit `.env` with your actual credentials:

```env
# Database
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=user
DB_NAME=exampledb
DB_HOST=localhost

# SentryBus
PORT=8085
HOST=localhost
URL=http://localhost:8085

# Redis
REDIS_USERNAME=default
REDIS_PASSWORD=supersecretpassword
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Blnk Ledger
BLNK_BASE_URL=https://your-blnk-instance.com
BLNK_API_KEY=your-blnk-api-key
BLNK_WEBHOOK_SIGNING_SECRET=your-blnk-webhook-secret

# Zoho CRM
ZOHO_CRM_BASE_URL=https://www.zohoapis.com/crm/v6
ZOHO_CRM_TOKEN=your-zoho-token

# Hasura
HASURA_URL=http://localhost:8080
HASURA_ADMIN_SECRET=your-hasura-admin-secret

# Paystack
PAYSATCK_SECRET_KEY=sk_test_xxxxx
PAYSATCK_URL=https://api.paystack.co
```

### 2. SentryBus Adapter Configs

Adapter configs live in `bus/`. They define which external services the bus routes events to. Edit the values in these files to match your setup:

- `bus/env.config.toml` — Bus runtime settings (port, Redis)
- `bus/blnk.config.toml` — Blnk ledger adapter
- `bus/zoho-crm.config.toml` — Zoho CRM adapter

## Running the Project

### Step 1: Start Redis

Make sure Redis is running on port 6379.

```bash
docker start redis
```

### Step 2: Run Database Migrations

Generate and apply the schema to PostgreSQL:

```bash
# Generate migration files from Drizzle schema
bun run makemigrations

# Apply migrations
bun run migrate
```

### Step 3: Start Hasura

Ensure Hasura is running and tracking your tables. Open the Hasura Console at `http://localhost:8080/console` and track the `products`, `orders`, and `order_items` tables.

### Step 4: Start SentryBus

```bash
bunx sentrybus
```

You should see:

```
  Services in bus:
  ────────────────────────────────────────
  blnk-ledger  ● enabled
    → shipment.delivered, invoice.due
  zoho-crm  ● enabled
    → driver.onboarded, company.account.updated
  ────────────────────────────────────────
   🚀 LISTENING  http://localhost:8085
[Redis] connected
```

### Step 5: Start the API Server

```bash
bun run dev
```

The API runs on `http://localhost:3000` with Swagger docs at `http://localhost:3000/docs`.

## API Endpoints

### Products

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | List products (paginated, searchable) |
| GET | `/products/:id` | Get product by ID |
| POST | `/products` | Create a product |
| PUT | `/products/:id` | Update a product |
| DELETE | `/products/:id` | Delete a product |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List orders (paginated, search, filter by status) |
| GET | `/orders/:id` | Get order by ID (includes product details) |
| POST | `/orders` | Create an order with items |
| PUT | `/orders/:id` | Update order details/status |
| DELETE | `/orders/:id` | Delete an order |

### Query Parameters

- `page` — Page number (default: 1)
- `limit` — Items per page (default: 10, max: 100)
- `search` — Search by title (products) or customer name/contact (orders)
- `status` — Filter orders by status

## How the Integration Works

1. **Payment initiated** — Client calls Paystack via `PaystackClient.inipayment()`, gets a payment URL
2. **Payment confirmed** — Paystack sends a webhook → `PaystackClient.wbHandler()` verifies the signature and extracts the reference
3. **Order updated** — Your app updates the order status in PostgreSQL
4. **Hasura detects change** — Hasura subscription fires via WebSocket
5. **Event published** — `HasuraClient.subscribeAndForward()` catches the change and POSTs to SentryBus at `http://localhost:8085/publish`
6. **SentryBus routes** — The bus matches the event topic to subscribed adapters and queues a job per adapter
7. **Blnk receives** — The bus dispatches to Blnk's ledger API (with retry, circuit breaking, rate limiting)

## Project Structure

```
example/
├── bus/                          # SentryBus adapter configs
│   ├── env.config.toml           # Bus runtime (port, Redis)
│   ├── blnk.config.toml          # Blnk ledger adapter
│   └── zoho-crm.config.toml      # Zoho CRM adapter
├── src/
│   ├── configs/
│   │   └── env.ts                # Environment variable loading
│   ├── data/
│   │   ├── db.ts                 # Drizzle database connection
│   │   ├── dto.ts                # Response DTOs
│   │   ├── models.ts             # Drizzle table schemas
│   │   └── schema.ts             # Zod validation schemas
│   ├── handlers/
│   │   ├── order.handler.ts      # Order route handlers
│   │   └── product.handler.ts    # Product route handlers
│   ├── libs/
│   │   ├── hasura/               # Hasura GraphQL + subscription client
│   │   ├── http/                 # Generic HTTP client (FetchClient)
│   │   └── paystack/             # Paystack payment + webhook client
│   ├── repos/
│   │   ├── order.repository.ts   # Order data access layer
│   │   └── product.repository.ts # Product data access layer
│   └── scripts/
│       └── migrate.ts            # Database migration runner
├── index.ts                      # App entrypoint (Elysia server)
├── drizzle.config.ts             # Drizzle Kit configuration
├── package.json
└── tsconfig.json
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start API server with hot reload |
| `bun run build` | Build for production |
| `bun run start` | Run production build |
| `bunx sentrybus` | Start the SentryBus integration bus |
| `bun run makemigrations` | Generate Drizzle migration files |
| `bun run migrate` | Apply migrations to database |
| `bun run db:studio` | Open Drizzle Studio (database GUI) |

## Tech Stack

- **Runtime** — [Bun](https://bun.sh)
- **API Framework** — [Elysia](https://elysiajs.com)
- **ORM** — [Drizzle ORM](https://orm.drizzle.team) (PostgreSQL)
- **Validation** — [Zod](https://zod.dev)
- **Integration Bus** — [SentryBus](https://www.npmjs.com/package/sentrybus)
- **Database** — PostgreSQL
- **Queue** — Redis + BullMQ (via SentryBus)
