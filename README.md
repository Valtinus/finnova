# FinNova Wallet

Digital wallet & payment app for the **FinNova Bank** platform. It was built for the *Development of Financial IT Systems* course.

| Feature | Status |
|---|---|
| Digital wallet (balance, freeze/unfreeze, statement) | ✅ API |
| P2P transfers (email / phone, idempotent, atomic) | ✅ API |
| QR payments (signed payment requests, PNG QR codes) | ✅ API |
| Card top-ups through a payment gateway (hosted checkout + signed webhooks) | ✅ API (mock gateway) |
| Payment history (filters, cursor paging) | ✅ API |
| Web frontend (login, dashboard, top-up, send, QR receive/scan, history, wallet) | ✅ `apps/web` |
| Smart contract: deposit, withdraw, transfer, check balance (Solidity, Remix, Ganache) | ✅ `packages/contracts` |
| Blockchain banking DApp in the web app (MetaMask, deposit, withdraw, transfer, balance, on-chain history) | ✅ `apps/web` → **Blockchain** page |
| Blockchain wallet linked to the FinNova account (signed message), on-chain transfers by email / phone, on-chain balance on the dashboard | ✅ API + web |
| Spending insights (money in/out charts) | ⏳ planned, web |
| Recent recipients on the Send screen | ⏳ planned, web |
| Share a payment request (QR image + link) | ⏳ planned, web |
| Statement export (CSV / PDF) | ⏳ planned, web |
| Notifications (in-app bell) | ⏳ planned, web + API |
| Multiple currency accounts (EUR, USD, HUF, …) | ⏳ planned, web + API |
| On-chain money in the EUR wallet and ledger (settlement through the API) | ⏳ `CryptoRail` stub, ready to implement |

**Stack:** Bun · Hono (+ zod-openapi, Swagger UI) · SQLite (`bun:sqlite`) · Drizzle ORM · React 19 + Vite · Solidity 0.8 + Ganache · ethers.js 6

---

## Quick start

```bash
bun install
cp apps/api/.env.example apps/api/.env   # optional, defaults work
bun run db:reset                         # create DB + demo data
bun run dev                              # API on http://localhost:3000
bun run dev:web                          # web app on http://localhost:5173
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

### Blockchain: smart contract + Blockchain page

The DApp is part of the web app: sign in, then open **Blockchain** in the sidebar (or **Open** on the dashboard's *Blockchain account* card). Start the API and the web app as above, plus the chain:

```bash
bun run chain              # local Ganache chain on http://127.0.0.1:8545 (chain id 1337); keep it running
bun run contracts:deploy   # deploy FinNovaBank.sol, write its address to apps/web/.env.local
bun run dev:web            # (re)start the web app so it picks up the address
```

In MetaMask, add the network `Localhost 8545` (RPC `http://127.0.0.1:8545`, chain ID `1337`, symbol `ETH`) and import Ganache test accounts 0 and 1. Their private keys are in the [contracts README](packages/contracts/README.md#option-b-from-the-command-line). The seed links **Bob's** FinNova account to account 1, so you can sign in as Alice, link account 0 and send ether to `bob@finnova.test`.

- [`packages/contracts/README.md`](packages/contracts/README.md): the contract, the Remix + MetaMask walkthrough (Lab 10), test accounts and troubleshooting.
- [Blockchain integration](#blockchain-integration) below: how the page, the API and the contract fit together (Lab 11).

## Scripts (from repo root)

| Command | What it does |
|---|---|
| `bun run dev` | API with hot reload |
| `bun run dev:web` | React frontend (Vite) on :5173 |
| `bun run --filter @finnova/web build` | Production build of the frontend |
| `bun run chain` | Local Ganache blockchain on :8545, 10 funded test accounts |
| `bun run contracts:deploy` | Deploy `FinNovaBank` to the local chain, write its address to `apps/web/.env.local` |
| `bun run contracts:compile` | Recompile `FinNovaBank.sol` into `packages/contracts/artifacts/` |
| `bun run test` | End-to-end API tests (in-memory DB) and smart contract tests (in-process Ganache) |
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
│  │  │  ├─ routes/            auth, wallet, customers, transfers, topups, qr, transactions, blockchain, webhooks, gateway
│  │  │  ├─ services/          business logic (ledger, payments, qr, transactions, wallets, customers, chain-accounts)
│  │  │  ├─ rails/             PaymentRail implementations: internal, card, crypto (stub)
│  │  │  ├─ gateway/           mock card gateway, checkout page, webhook signatures
│  │  │  ├─ middleware/        JWT auth
│  │  │  └─ lib/               errors, ids, formatting, router factory
│  │  └─ test/                 bun test suites
│  └─ web/                     React + Vite frontend (ready)
│     └─ src/blockchain/       Blockchain page (DApp): MetaMask, contract, wallet linking (ethers.js, lazy-loaded)
├─ packages/
│  ├─ shared/                  domain constants, money helpers, PaymentRail interface
│  └─ contracts/               FinNovaBank.sol, compiled ABI, compile/deploy scripts, contract tests
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

### Blockchain integration
The FinNova Bank smart contract ([`FinNovaBank.sol`](packages/contracts/contracts/FinNovaBank.sol)) holds ether per blockchain address. The web app talks to it directly through MetaMask; the API knows which address belongs to which customer.

```
 web app ── /blockchain page ── MetaMask ── ethers.js ──▶ FinNovaBank contract (Ganache :8545)
    │            │                                               ▲
    │            └── link wallet, find recipients ──▶ API        │
    └── dashboard card: balanceOf(linked address) ───────────────┘  (read-only RPC, no MetaMask)
```

1. **Linking a wallet.** On the Blockchain page the signed-in customer connects MetaMask and clicks *Link wallet to FinNova*. The API returns a message naming the customer, the address, the time and a nonce (`POST /blockchain/account/challenge`). The customer signs it in MetaMask: this is free and sends no transaction. The API recovers the signer from the signature and stores the address only if it matches (`PUT /blockchain/account`, table `chain_accounts`). The nonce is an HMAC under a server secret, so the API stores no challenge state. Challenges expire after 10 minutes, and an address can belong to one customer only.
2. **Operations.** Deposit, withdraw and transfer are contract calls that MetaMask signs. Their history is read back from the contract's events.
3. **Paying FinNova customers.** The transfer recipient can be an address, or a customer's **email or phone**. `GET /blockchain/lookup` returns the address the customer linked, and the page shows their name before you send. The same lookup turns addresses in the history into names (*To Bob Nagy*).
4. **Dashboard.** The *Blockchain account* card shows the linked wallet's balance at the contract next to the EUR wallet. It reads the balance with `balanceOf()` straight from the chain, so MetaMask is not needed for it.

Ether and euros stay separate: on-chain operations don't change the EUR wallet or the ledger. That bridge is the `CryptoRail` (see Payment rails above and the Roadmap).

## Roadmap

Planned next, in suggested order:

| # | Feature | Where | Notes |
|---|---|---|---|
| 1 | **Spending insights**: money in vs. out by week/month, split by type (top-up, transfer, QR) | web | Charts built from `GET /transactions` (and the statement). No API change needed at first; a server-side aggregate endpoint can follow if paging gets expensive. |
| 2 | **Recent recipients**: quick-pick avatars on the Send screen | web | Derived from past outgoing transfers. Pinning favourites can come later. |
| 3 | **Share a payment request**: download/share the QR as an image, copy a deep link | web | Uses the public `GET /qr/:id/image.png`. Useful for the merchant (Café) flow. |
| 4 | **Statement export**: CSV and PDF of the filtered Activity list or a date range | web (+ optional API) | CSV client-side from the loaded pages; PDF via print stylesheet. A `GET /transactions/export` endpoint would avoid paging in the browser. |
| 5 | **Notifications**: in-app bell with unread count for incoming money, paid QR requests and failed top-ups | web + API | Start with polling a `GET /notifications` feed, move to server-sent events if needed. Needs a `notifications` table. |
| 6 | **Multiple currency accounts** (EUR, USD, HUF, …): one wallet per currency per customer, an account switcher, and currency conversion between your own accounts | web + API | Today the API assumes one EUR wallet per customer (`CURRENCY` constant, `/wallet` returns a single wallet). Needs: a `currency` list in `@finnova/shared`, several wallets per customer (unique per currency), `?currency=`/wallet id on wallet, top-up, transfer, QR and ledger endpoints, per-currency formatting and limits (HUF has no minor unit in practice), a mock FX rate source with a `POST /wallet/convert` that debits one wallet and credits another atomically, and per-currency ledger accounts so each currency still balances. Transfers stay same-currency at first. |

Not planned yet: on-chain settlement through the API (`CryptoRail`). A chain watcher would turn `Deposited` events of linked wallets into `CRYPTO` top-ups of the EUR wallet, booked against the `crypto_clearing` ledger account. Today the Blockchain page and the API share the customer ↔ wallet link, but ether and euro balances stay separate.

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
| POST | `/blockchain/account/challenge` | Start linking a MetaMask wallet: the message to sign |
| GET / PUT / DELETE | `/blockchain/account` | My linked wallet: get, link (with the signature), unlink |
| GET | `/blockchain/lookup?q=` | A customer's linked wallet by email, phone or address |
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

Every step above can be captured in the web app (`bun run dev:web`); Swagger UI covers the endpoint overview.

The blockchain labs have their own checklists:

- **Lab 10, smart contract** (Remix, MetaMask, deployment, deposit / withdraw / transfer / balance): see the [contracts README](packages/contracts/README.md#screenshot-checklist-lab-10-deliverable), saved to `docs/screenshots/lab10/`.
- **Lab 11, DApp** (in the web app, signed in as Alice), saved to `docs/screenshots/lab11/`:
  1. **Wallet connection:** the Blockchain page before connecting, the MetaMask *Connect* prompt, then the connected card with the network pill (`Localhost (Ganache)`) and the address.
  2. **Link to FinNova:** *Link wallet to FinNova*, the MetaMask signature request (the message names Alice and the address), then the *Linked* badge.
  3. **Deposit:** 2 ETH, the MetaMask confirmation, then the green confirmation (block number) and the balance card at 2 ETH.
  4. **Transfer:** recipient `bob@finnova.test` (the page shows *Bob Nagy* and his address), amount 0.75, the MetaMask confirmation and *Sent 0.75 ETH to Bob Nagy*. Then sign in as Bob, switch MetaMask to account 1 and show *From Alice Kovács* in his history.
  5. **Balance:** the balance card after the operations (*Check balance* re-reads it), and the dashboard's *Blockchain account* card next to the EUR wallet.
  6. **Transaction history:** deposits, withdrawals and transfers with names, a filter applied, and the details dialog of one transaction.
  7. *(optional)* `Insufficient balance` when withdrawing more than the balance, and *Swagger UI → Blockchain* for the API side.
