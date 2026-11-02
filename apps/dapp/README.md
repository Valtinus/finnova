# apps/dapp: FinNova Bank DApp

A React + ethers.js web interface for the [FinNova Bank smart contract](../../packages/contracts) (Lab 10). It talks to the blockchain through MetaMask: no FinNova server, no login. The look comes from the web app's design system, which is imported from `apps/web` (see `src/ui.ts`).

| Feature | How it works |
|---|---|
| **Connect wallet** | `eth_requestAccounts` through MetaMask. The DApp follows account and network switches, reconnects on reload and can disconnect (revokes the site's permission). |
| **Deposit** | `deposit()` with the amount sent as ether (`value`) |
| **Withdraw** | `withdraw(amount)` |
| **Transfer** | `transfer(to, amount)` to any address |
| **Check balance** | `checkBalance()`, called as the connected account. Shown next to the ETH left in the wallet, re-read on every new block. The **Check balance** button reads it on demand. |
| **Transaction history** | The contract's `Deposited`, `Withdrawn` and `Transferred` events for your address (sent *and* received). Grouped by day, with filters and a details dialog (block, tx hash, balance after). |

Each operation shows *Confirm in MetaMask…*, then *Waiting for the block…*, then a confirmation with the block number, gas used and transaction hash. The DApp checks amounts and addresses before opening MetaMask, and it shows the contract's own revert message (for example `Insufficient balance`) when a transaction fails.

## Run it

You need [MetaMask](https://metamask.io/download/) in the browser. Then, from the repo root:

```bash
bun install
bun run chain              # terminal 1: local Ganache chain, http://127.0.0.1:8545, chain id 1337
bun run contracts:deploy   # deploys FinNovaBank, writes VITE_CONTRACT_ADDRESS to apps/dapp/.env.local
bun run dev:dapp           # terminal 2: http://localhost:5174
```

In MetaMask, add the network `Localhost 8545` (RPC `http://127.0.0.1:8545`, chain ID `1337`, symbol `ETH`) and import test accounts 0 and 1. Their private keys are in the [contracts README](../../packages/contracts/README.md#option-b-from-the-command-line). If MetaMask is on another network, the DApp offers a **Switch to Localhost 8545** button.

**Deployed from Remix instead?** Deploy with *Injected Provider – MetaMask* on the same local chain. Then paste the address from *Deployed Contracts* under **Smart contract → Change**, or put it in `apps/dapp/.env.local` as `VITE_CONTRACT_ADDRESS=0x…`.

**Restarted the chain?** It starts empty. Run `bun run contracts:deploy` again, restart `dev:dapp`, and in MetaMask clear the old nonces under *Settings → Advanced → Clear activity tab data*.

## Code map

| Path | |
|---|---|
| `src/hooks/useWallet.ts` | MetaMask connection: account, chain, ethers `BrowserProvider` and signer, network switching |
| `src/hooks/useBank.ts` | The contract for the connected account: balances, event history, `deposit` / `withdraw` / `transfer`, refresh on each block |
| `src/hooks/useContractAddress.ts` | Contract address from `VITE_CONTRACT_ADDRESS`, or the one pasted in the UI |
| `src/components/` | Connect screen, top bar, balance card, operations form, history, contract card |
| `src/ui.ts` | The only bridge to `apps/web` (styles, icons, toasts, modal, theme toggle) |

The ABI comes from `@finnova/contracts`, so the DApp always matches the compiled contract.

## Screenshot checklist (Lab 11 deliverable)

Save to `docs/screenshots/lab11/`:

1. **Wallet connection:** the connect screen, the MetaMask *Connect* prompt, then the dashboard with the network pill (`Localhost (Ganache)`) and your address in the top bar.
2. **Deposit:** 2 ETH entered, the MetaMask confirmation, then the green confirmation (block number) and the balance card at 2 ETH.
3. **Transfer:** recipient = account 1, amount 0.75, the MetaMask confirmation and the confirmation card. Then switch MetaMask to account 1 and show its balance and the *From 0x90F8…* entry.
4. **Balance:** the balance card after the operations (account balance plus wallet ETH). *Check balance* re-reads it.
5. **Transaction history:** the list with deposits, withdrawals and transfers, a filter applied, and the details dialog of one transaction.
6. *(optional)* The `Insufficient balance` message when withdrawing more than the balance, and the light theme or the phone layout.
