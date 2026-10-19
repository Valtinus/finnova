# FinNova Wallet

Digital wallet & payment app for the **FinNova Bank** platform. It was built for the *Development of Financial IT Systems* course.

| Feature | Status |
|---|---|
| Digital wallet (balance, freeze/unfreeze, statement) | ✅ API |
| P2P transfers (email / phone, idempotent, atomic) | ✅ API |
| QR payments (signed payment requests, PNG QR codes) | ✅ API |
| Card top-ups through a payment gateway (hosted checkout + signed webhooks) | ✅ API (mock gateway) |
| Payment history (filters, cursor paging) | ✅ API |
| Web frontend | ⏳ `apps/web` (empty, see its README) |
| Decentralized payments | ⏳ `CryptoRail` stub, ready to implement |

**Stack:** Bun · Hono (+ zod-openapi, Swagger UI) · SQLite (`bun:sqlite`) · Drizzle ORM · React (planned)

---

## Quick start

```bash
bun install
cp apps/api/.env.example apps/api/.env   # optional, defaults work
bun run db:reset                         # create DB + demo data
bun run dev                              # API on http://localhost:3000
```

Open **http://localhost:3000/docs** for Swagger UI.

1. `POST /auth/login` → `alice@finnova.test` / `Password123!`
2. Copy `token`, click **Authorize**, then paste it.
3. Try `GET /wallet`, `POST /transfers`, `POST /qr`, `POST /topups`, and `GET /transactions`.

Demo accounts (all use `Password123!`):

| Email | Role | Balance after seed |
|---|---|---|
| alice@finnova.test | customer | €238.00 |
| bob@finnova.test | customer | €107.50 |
| cafe@finnova.test | merchant (QR payee) | €4.50 |

The seed script also prints an **open QR payload** (€3.20 croissant) you can pay right away via `POST /qr/pay`.

## Scripts (from repo root)

| Command | What it does |
|---|---|
| `bun run dev` | API with hot reload |
| `bun run test` | End-to-end API tests (in-memory DB) |
| `bun run typecheck` | TypeScript across all workspaces |
| `bun run db:reset` | Delete DB, migrate, and seed demo data |
| `bun run db:seed` | Seed only (skips if data exists) |
| `bun run db:migrate` | Apply migrations |

Inside `apps/api`: `bun run db:generate` creates a new migration after you edit `src/db/schema.ts`. `bun run db:studio` opens Drizzle Studio.

---

## Repository layout

```
finnova/
├─ apps/
│  ├─ api/                     Hono REST API (ready)
│  │  ├─ drizzle/              SQL migrations (generated)
│  │  ├─ src/
│  │  │  ├─ app.ts             createApp(): wiring, error handler, Swagger, AppType export
│  │  │  ├─ index.ts           Bun.serve entry point
│  │  │  ├─ config.ts          env config
│  │  │  ├─ schemas.ts         shared OpenAPI/zod schemas
│  │  │  ├─ db/                schema, client (auto-migrates), seed, reset
│  │  │  ├─ routes/            auth, wallet, customers, transfers, topups, qr, transactions, webhooks, gateway
│  │  │  ├─ services/          business logic (ledger, payments, qr, transactions, wallets, customers)
│  │  │  ├─ rails/             PaymentRail implementations: internal, card, crypto (stub)
│  │  │  ├─ gateway/           mock card gateway, checkout page, webhook signatures
│  │  │  ├─ middleware/        JWT auth
│  │  │  └─ lib/               errors, ids, formatting, router factory
│  │  └─ test/                 bun test suites
│  └─ web/                     React frontend (to do, folders prepared)
├─ packages/
│  └─ shared/                  domain constants, money helpers, PaymentRail interface
└─ docs/screenshots/           put deliverable screenshots here
```

---

## How it works

### Money & ledger
- All amounts are **integer euro cents** (`1250` = €12.50). There are no floats anywhere.
- Each wallet has a cached `balance_cents`. Every money movement also writes **double-entry `ledger_entries`** (debit/credit with `balance_after`). A test asserts that the ledger always balances.
- A debit uses a single conditional `UPDATE … WHERE balance >= amount`. A `CHECK (balance >= 0)` constraint backs it up, so overdrafts are impossible even under concurrency.

### Transactions
`transactions` is the business view: `type` (TOPUP / TRANSFER / QR_PAYMENT), `status` (PENDING / COMPLETED / FAILED), `rail`, `reference` (e.g. `FN-7K2P9QXA`), and `idempotency_key`.

- **Failed attempts are kept** (for example, insufficient funds), so the history screen can show them. Only the sender sees a failed transfer.
- **Idempotency:** send an `Idempotency-Key` header on `POST /transfers`, `/qr/pay`, and `/topups`. If you retry with the same key, you get the original result (`Idempotent-Replayed: true`) instead of a second payment. Reusing a key for a different request returns `409`.

### Payment rails (ready for decentralized payments)
`packages/shared/src/rails.ts` defines:

```ts
interface PaymentRail { id; initiate(); confirm(); fail(); getStatus(); }
```

| Rail | Used for | Flow |
|---|---|---|
| `INTERNAL` | P2P, QR | instant, one SQLite transaction (debit + credit + status) |
| `CARD` | top-ups | `PENDING` → gateway checkout → signed webhook → `COMPLETED` / `FAILED` |
| `CRYPTO` | *next module* | stub in `apps/api/src/rails/crypto.ts` |

To add decentralized payments, implement `CryptoRail` (for example, stablecoin on a testnet). Its `confirm()` would be called by a chain watcher, the same way `CARD.confirm()` is called by the webhook. Then add routes. The `rail` column and the `crypto_clearing` ledger account are already in place.

### Payment gateway (mock)
`src/gateway/mock-gateway.ts` simulates an external card processor, similar to Stripe test mode:

1. `POST /topups` creates a PENDING transaction and a checkout session, and returns `checkoutUrl`.
2. The customer opens the **hosted checkout page** (`/gateway/checkout/:id`) and enters a test card.
3. The gateway sends `POST /webhooks/gateway`, signed with `X-Gateway-Signature: t=…,v1=HMAC-SHA256`.
4. FinNova verifies the signature, then credits the wallet (or marks the transaction FAILED).

| Test card | Result |
|---|---|
| `4242 4242 4242 4242` | success |
| `4000 0000 0000 0002` | declined |
| `4000 0000 0000 9995` | insufficient funds |
| `4000 0000 0000 0069` | expired card |

Pass `returnUrl` (for example `http://localhost:5173/wallet`) to `POST /topups`, and the checkout page redirects back with `?topup=<id>&status=success|failed`.

### QR payments
1. The payee calls `POST /qr` with `{ amountCents, description }`. The response contains `payload` (`finnova://pay?rid=…&sig=…`) and `qrDataUrl` (a PNG). `GET /qr/:id/image.png` also serves the image.
2. The payer scans it and calls `POST /qr/resolve`, which previews the amount and payee.
3. The payer calls `POST /qr/pay`. Settlement and marking the request `PAID` happen in **one DB transaction**, so a QR can't be paid twice. Requests expire (default 15 min) and can be cancelled.
4. The signature (HMAC over id + amount + payee) rejects forged or tampered codes.

---

## API overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Register (wallet auto-created) |
| POST | `/auth/login` | Log in, get JWT |
| GET | `/auth/me` | Current customer + wallet |
| GET / POST / PATCH | `/wallet` | Get, create, rename/freeze wallet |
| GET | `/wallet/ledger` | Statement lines with running balance |
| GET | `/customers/lookup?q=` | Find recipient by email/phone |
| POST | `/transfers` | P2P transfer |
| POST | `/topups` · GET `/topups/:id` | Card top-up via gateway, poll status |
| POST | `/qr` · GET `/qr` · GET/DELETE `/qr/:id` | Payee: create/list/poll/cancel requests |
| GET | `/qr/:id/image.png` | QR as PNG (public) |
| POST | `/qr/resolve` · `/qr/pay` | Payer: preview & pay |
| GET | `/transactions` · `/transactions/:id` | History (filters: type, status, direction; cursor `before`) |
| POST | `/webhooks/gateway` | Gateway callback (signed) |
| GET/POST | `/gateway/...` | Mock gateway: checkout page, session, pay |

Errors always look like `{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "...", "details": {...} } }`.

---

## Screenshot checklist (deliverable)

Save screenshots to `docs/screenshots/`:

1. **Wallet management:** dashboard with balance, plus the freeze toggle (or Swagger `GET /wallet`, `PATCH /wallet`).
2. **Top-up / payment processing:** the gateway checkout page, the success screen, and the balance after.
3. **Declined payment:** checkout with `4000 0000 0000 0002`, then history showing FAILED.
4. **P2P transfer:** the send form, the confirmation, and the recipient's history showing the incoming transfer.
5. **QR payment:** the generated QR (merchant), the scan preview (payer), and the paid status.
6. **Payment history:** the filtered list with status chips.
7. **Swagger UI:** an overview of all endpoints.

Until the frontend exists, steps 2 and 3 already work in the browser (the checkout page), and the rest can be shown in Swagger UI.
