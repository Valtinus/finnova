# packages/contracts: FinNova Bank smart contract

`contracts/FinNovaBank.sol` is a Solidity smart contract for basic banking on a local blockchain. Each address has its own account balance (in ether) held by the contract. Every operation emits an event, so the whole history is recorded on chain.

| Function | Kind | Description |
|---|---|---|
| `deposit()` | `payable` | Deposit the ether sent with the call (Remix: the **Value** field) into your account. |
| `withdraw(uint256 amount)` | transaction | Withdraw `amount` wei from your account back to your wallet. |
| `transfer(address to, uint256 amount)` | transaction | Move `amount` wei from your account to the account of `to`. |
| `checkBalance()` | `view` | Your current account balance in wei. |
| `balanceOf(address)` | `view` | Account balance of any address (used by the tests). |
| `totalDeposits()` | `view` | Ether held by the bank in total (the sum of all accounts). |

| Event | Emitted by |
|---|---|
| `Deposited(account, amount, newBalance, timestamp)` | `deposit()`, or plain ether sent to the contract |
| `Withdrawn(account, amount, newBalance, timestamp)` | `withdraw()` |
| `Transferred(from, to, amount, timestamp)` | `transfer()` |

**Rules.** Amounts must be greater than zero. You can't withdraw or transfer more than your balance (`Insufficient balance`), transfer to the zero address, or transfer to yourself. `withdraw()` lowers the balance *before* it sends the ether (checks-effects-interactions), so a re-entrant call can't withdraw the same funds twice.

All amounts on chain are in **wei**: 1 ETH = 10¹⁸ wei = `1000000000000000000`.

---

## Option A: Remix IDE (the Lab 10 workflow)

### 1. Compile

1. Open <https://remix.ethereum.org>. In the **File explorer**, create `FinNovaBank.sol` and paste in [`contracts/FinNovaBank.sol`](contracts/FinNovaBank.sol).
2. Open the **Solidity compiler** tab. Pick any compiler from **0.8.20** up (this repo uses 0.8.28).
3. Only if you will deploy to **Ganache**: open *Advanced configurations* and set **EVM version** to `paris`. Ganache doesn't support the opcodes that newer compilers emit by default.
4. Click **Compile FinNovaBank.sol**. A green check mark means it compiled.

### 2. Choose a blockchain

In **Deploy & run transactions**, set **Environment** to one of these:

| Environment | Use it when |
|---|---|
| **Remix VM** (Cancun / Prague) | Quickest test. It runs inside the browser and has 10 accounts with 100 ETH each. The web app's Blockchain page can't reach this chain. |
| **Injected Provider – MetaMask** | Deploy to the local Ganache chain through MetaMask (see *Local chain + MetaMask* below). MetaMask asks you to confirm each transaction. This is the deployment the Blockchain page of the web app (Lab 11) uses. |
| **Custom – External Http Provider** (called *Dev – Ganache Provider* in older Remix versions) | Connect Remix straight to Ganache at `http://127.0.0.1:8545`, with no MetaMask prompts. |

### 3. Deploy

Select `FinNovaBank` under **Contract** and click **Deploy**. The contract appears under **Deployed Contracts** with its address. Copy that address: the Blockchain page needs it (paste it under *Smart contract → Change*).

### 4. Run each operation and check the balances

Expand the deployed contract. Orange buttons send transactions, red ones are payable, and blue ones are free reads. The values below use two accounts, **A** and **B**, picked in the **Account** dropdown.

| # | Account | Action | Expected result |
|---|---|---|---|
| 1 | A | `checkBalance` | `0` |
| 2 | A | Set **Value** to `2` **Ether**, then click `deposit` | Transaction succeeds. The log shows `Deposited` with `amount = 2000000000000000000`. |
| 3 | A | `checkBalance` | `2000000000000000000` (2 ETH) |
| 4 | A | `withdraw` with `500000000000000000` | `Withdrawn` event. Account A's wallet balance goes up by 0.5 ETH (minus gas). |
| 5 | A | `checkBalance` | `1500000000000000000` (1.5 ETH) |
| 6 | A | `transfer` with `to` = B's address (copy icon next to the account), `amount` = `750000000000000000` | `Transferred` event |
| 7 | A | `checkBalance` | `750000000000000000` (0.75 ETH) |
| 8 | B | `checkBalance` | `750000000000000000`: B received the transfer |
| 9 | A | `withdraw` with `5000000000000000000` | Reverts with **`Insufficient balance`**. The balance stays at 0.75 ETH. |
| 10 | any | `totalDeposits` | `1500000000000000000`: the bank still holds A's and B's 0.75 ETH each |

Remember to set **Value** back to `0` after the deposit. Otherwise `withdraw` and `transfer` fail, because they don't accept ether.

To see an operation's on-chain record, click its line in the Remix terminal. The details show the transaction hash, block, gas, `decoded input` and the emitted event under `logs`.

---

## Option B: from the command line

```bash
bun run chain               # local Ganache chain on http://127.0.0.1:8545 (chain id 1337), keep it running
bun run contracts:deploy    # compile output → deploy → writes the address to apps/web/.env.local
bun run --filter '@finnova/contracts' test   # 17 tests on an in-process Ganache chain
bun run contracts:compile   # recompile after editing the .sol file (updates artifacts/FinNovaBank.json)
```

`bun run chain` uses a fixed mnemonic, so it gives the same 10 accounts with 1000 ETH each on every start. The first two are:

| # | Address | Private key (test only, never use on a real network) |
|---|---|---|
| 0 | `0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1` | `0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d` |
| 1 | `0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0` | `0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1` |

The chain lives in memory. After a restart, deploy again (and see *Troubleshooting*).

`deploy` uses the node's first unlocked account. Set `RPC_URL` for another node, for example the Ganache desktop app at `http://127.0.0.1:7545`. Set `PRIVATE_KEY` to deploy from a specific account.

### Local chain + MetaMask

1. Start the chain: `bun run chain` (or open the Ganache desktop app).
2. In MetaMask, go to **Networks → Add a network → Add a network manually**:
   - Network name `Localhost 8545`
   - RPC URL `http://127.0.0.1:8545` (Ganache desktop: `:7545`)
   - Chain ID `1337`
   - Currency symbol `ETH`
3. Go to **Account → Add account → Import account** and paste the private keys of accounts 0 and 1 above. Each shows 1000 ETH.

### Troubleshooting

- **"Nonce too high" or transactions stuck after restarting the chain:** MetaMask remembers the old chain. Go to *Settings → Advanced → Clear activity tab data*.
- **"invalid opcode" when deploying from Remix to Ganache:** set the EVM version to `paris` (step 1.3) and compile again.
- **Remix can't reach Ganache via External Http Provider:** Remix in https can't always call `http://localhost`. Use *Injected Provider – MetaMask* instead.

---

## What's in this package

| Path | |
|---|---|
| `contracts/FinNovaBank.sol` | The contract |
| `artifacts/FinNovaBank.json` | ABI and bytecode (committed). A test fails if it's out of date with the `.sol` file. |
| `scripts/compile.ts` | Compiles with solc-js 0.8.28 (`paris` EVM, optimizer on) |
| `scripts/deploy.ts` | Deploys to `RPC_URL` and writes `VITE_CONTRACT_ADDRESS` to `apps/web/.env.local` for the Blockchain page |
| `src/index.ts` | Exports `FINNOVA_BANK_ABI`, `FINNOVA_BANK_BYTECODE`, the typed `FinNovaBank` contract and `describeError()` / `revertReason()` |
| `test/FinNovaBank.test.ts` | Tests for every operation, balance check, event and revert rule |

## Screenshot checklist (Lab 10 deliverable)

Save to `docs/screenshots/lab10/`:

1. **Source and compile:** `FinNovaBank.sol` open in Remix with the green compile check.
2. **Deployment:** the environment (Injected Provider – MetaMask on `Localhost 8545`, chain 1337), the MetaMask confirmation, and the contract under *Deployed Contracts* with its address.
3. **Deposit:** Value = 2 Ether, the successful transaction in the terminal with the `Deposited` log.
4. **Balance check:** `checkBalance` returning `2000000000000000000`.
5. **Withdrawal:** the `withdraw` transaction plus `checkBalance` showing `1500000000000000000`.
6. **Transfer:** the `transfer` transaction to account B, then `checkBalance` for A (0.75 ETH) and for B (0.75 ETH).
7. **Rejected withdrawal:** the `Insufficient balance` revert.
8. *(optional)* `bun run --filter '@finnova/contracts' test` output with all tests passing.
