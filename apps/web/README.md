# apps/web: FinNova Wallet frontend (to do)

The folders are prepared but the app isn't scaffolded yet. The API in `apps/api` is complete.

## Scaffold

From the repo root:

```bash
cd apps
bun create vite web --template react-ts   # choose "Ignore files and continue"
cd web
```

Then edit `apps/web/package.json`:

```jsonc
{
  "name": "@finnova/web",
  "dependencies": {
    "@finnova/api": "workspace:*",      // for the typed RPC client (types only)
    "@finnova/shared": "workspace:*",   // formatCents, constants
    "hono": "^4.13.13"
    // + react-router-dom, qrcode scanner (e.g. "@yudiel/react-qr-scanner"), ...
  }
}
```

Run `bun install` at the repo root, then `bun run dev:web`.

## Typed API client (no codegen)

```ts
// src/lib/api.ts
import { hc } from "hono/client";
import type { AppType } from "@finnova/api";

export const api = (token?: string) =>
  hc<AppType>("http://localhost:3000", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

// usage
const res = await api(token).wallet.$get();
const wallet = await res.json(); // fully typed
```

CORS already allows `http://localhost:5173` (see `CORS_ORIGINS` in `apps/api/.env.example`).

## Planned screens

| Route | Screen | API |
|---|---|---|
| `/login` | Login / register | `POST /auth/login`, `/auth/register` |
| `/` | Dashboard: balance card, Top up / Send / Scan / Receive, last 5 transactions | `GET /wallet`, `GET /transactions?limit=5` |
| `/topup` | Amount, then redirect to `checkoutUrl`, then back with `?topup=…&status=…` | `POST /topups` (with `returnUrl`), `GET /topups/:id` |
| `/send` | Recipient lookup, then amount + note, then confirm | `GET /customers/lookup`, `POST /transfers` |
| `/receive` | Enter amount, show QR, poll until PAID | `POST /qr`, `GET /qr/:id` |
| `/scan` | Camera scan, then preview, then pay | `POST /qr/resolve`, `POST /qr/pay` |
| `/history` | Filters (type/status/direction), infinite scroll, details | `GET /transactions`, `GET /transactions/:id` |
| `/wallet` | Nickname, freeze toggle, statement | `PATCH /wallet`, `GET /wallet/ledger` |

Tips:
- Generate one `crypto.randomUUID()` per payment form and send it as `Idempotency-Key`.
- Render money with `formatCents()` from `@finnova/shared`, and parse input with `parseAmountToCents()`.

## Folders

```
src/
  pages/       one component per route above
  components/  BalanceCard, TransactionRow, StatusChip, AmountInput, QrScanner...
  hooks/       useAuth, useWallet, useTransactions
  lib/         api client, auth storage
public/
```
