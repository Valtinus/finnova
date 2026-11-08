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
| `/blockchain` | The DApp: connect MetaMask, link it to the account (signed message), deposit / withdraw / transfer through the FinNova Bank smart contract, on-chain history with customer names | `/blockchain/*`, plus the contract through MetaMask |

The dashboard also has a *Blockchain account* card. It shows the linked wallet's balance at the contract, read straight from the chain.

## Blockchain page

The code lives in `src/blockchain/`. It is lazy-loaded, so ethers.js is only downloaded when the Blockchain page or the dashboard card needs it.

| Path | |
|---|---|
| `useMetaMask.ts` | MetaMask connection: account, chain, ethers `BrowserProvider` and signer, network switching |
| `useBank.ts` | The contract for the connected account: balances, event history, `deposit` / `withdraw` / `transfer`, refresh on each block |
| `useChainAccount.ts` | The wallet linked to the FinNova account: challenge, sign in MetaMask, link / unlink through the API |
| `useChainNames.ts` | Addresses to FinNova customer names, for the history |
| `useContractAddress.ts` | Contract address from `VITE_CONTRACT_ADDRESS`, or one pasted in the UI (e.g. deployed from Remix) |
| `LinkCard.tsx`, `BankBalanceCard.tsx`, `OperationsCard.tsx`, `HistoryCard.tsx`, `ContractCard.tsx` | The page's cards |
| `ChainSummaryCard.tsx` | The dashboard card |

Settings (in `.env.local`, see `.env.example`): `VITE_CONTRACT_ADDRESS` is written by `bun run contracts:deploy`. `VITE_RPC_URL` defaults to `http://127.0.0.1:8545`.

**Restarted the chain?** It starts empty. Run `bun run contracts:deploy` again and restart `dev:web`. In MetaMask, clear the old nonces under *Settings → Advanced → Clear activity tab data*.

Light and dark themes follow the system setting by default; the toggle in the sidebar (or the top bar on mobile) overrides it and is remembered.

Every payment form generates one `Idempotency-Key` per attempt, so a double click or retry never pays twice.
