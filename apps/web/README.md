# apps/web: FinNova Wallet frontend

React 19 + Vite + TypeScript. No UI framework: the design system is plain CSS in `src/styles`.

```bash
# from the repo root
bun install
bun run db:reset        # demo data
bun run dev             # API on :3000
bun run dev:web         # web on :5173
```

Sign in with `alice@finnova.test` / `Password123!` (the login page has one-click demo buttons).

Set `VITE_API_URL` (see `.env.example`) if the API is not on `http://localhost:3000`.

## Screens

| Route | Screen | API |
|---|---|---|
| `/login`, `/register` | Sign in / create account | `POST /auth/login`, `/auth/register` |
| `/` | Dashboard: balance, quick actions, recent activity | `GET /wallet`, `GET /transactions` |
| `/topup` | Amount, then hosted gateway checkout, then result | `POST /topups`, `GET /topups/:id` |
| `/send` | Recipient lookup, amount + note, confirm | `GET /customers/lookup`, `POST /transfers` |
| `/receive` | Create a QR request, live status, cancel, recent requests | `POST /qr`, `GET /qr`, `GET /qr/:id`, `DELETE /qr/:id` |
| `/scan` | Camera or pasted payload, preview, pay | `POST /qr/resolve`, `POST /qr/pay` |
| `/history` | Filters, load more, receipt dialog | `GET /transactions`, `GET /transactions/:id` |
| `/wallet` | Nickname, freeze/unfreeze, statement | `PATCH /wallet`, `GET /wallet/ledger` |

Light and dark themes follow the system setting by default; the toggle in the sidebar (or the top bar on mobile) overrides it and is remembered.

Every payment form generates one `Idempotency-Key` per attempt, so a double click or retry never pays twice.
