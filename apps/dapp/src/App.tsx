import { useState } from "react";
import { BankBalanceCard } from "./components/BankBalanceCard";
import { ConnectScreen } from "./components/ConnectScreen";
import { ContractCard } from "./components/ContractCard";
import { HistoryCard } from "./components/HistoryCard";
import { OperationsCard } from "./components/OperationsCard";
import { Topbar } from "./components/Topbar";
import { useBank } from "./hooks/useBank";
import { useContractAddress } from "./hooks/useContractAddress";
import { useWallet, type Wallet } from "./hooks/useWallet";
import { LOCAL_CHAIN, chainName } from "./lib/eth";
import { Alert, PageSpinner, ToastProvider } from "./ui";

export default function App() {
  return (
    <ToastProvider>
      <DApp />
    </ToastProvider>
  );
}

function DApp() {
  const wallet = useWallet();
  const contract = useContractAddress();
  const bank = useBank(wallet, contract.address);

  if (wallet.status !== "connected" || !wallet.account) return <ConnectScreen wallet={wallet} />;

  return (
    <div className="dapp">
      <Topbar wallet={wallet} />
      <main className="main stack-lg">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1>On-chain banking</h1>
            <p>Deposit, withdraw and transfer ether through the FinNova Bank smart contract.</p>
          </div>
        </div>

        <ContractProblem wallet={wallet} state={bank.contractState} address={contract.address} />

        {bank.contractState === "checking" ? (
          <PageSpinner />
        ) : (
          <div className="grid-2">
            <div className="stack">
              {bank.contractState === "ready" && (
                <>
                  <BankBalanceCard bank={bank} />
                  <OperationsCard bank={bank} account={wallet.account} />
                </>
              )}
              <ContractCard
                bank={bank}
                address={contract.address}
                fromEnv={contract.fromEnv}
                chainId={wallet.chainId}
                onChange={contract.save}
              />
            </div>
            {bank.contractState === "ready" && <HistoryCard history={bank.history} error={bank.error} />}
          </div>
        )}
      </main>
    </div>
  );
}

/** Explains why the DApp can't reach the contract: no address configured, or nothing deployed there on this network. */
function ContractProblem({ wallet, state, address }: { wallet: Wallet; state: string; address: string | null }) {
  const [switching, setSwitching] = useState(false);

  if (state === "no-address") {
    return (
      <Alert kind="info">
        No contract address set. Run <code>bun run contracts:deploy</code>, or deploy <code>FinNovaBank.sol</code> from Remix and paste its address
        under <strong>Smart contract → Change</strong>.
      </Alert>
    );
  }
  if (state !== "missing") return null;

  const onLocal = wallet.chainId === LOCAL_CHAIN.chainId;
  return (
    <Alert kind="warn">
      <div className="stack" style={{ gap: 10 }}>
        <span>
          There is no FinNovaBank contract at <code>{address}</code> on {wallet.chainId === null ? "this network" : chainName(wallet.chainId)}.{" "}
          {onLocal
            ? "If you restarted the local chain, deploy the contract again (bun run contracts:deploy)."
            : `Switch MetaMask to ${LOCAL_CHAIN.name} (chain ID ${LOCAL_CHAIN.chainId}), where the contract is deployed.`}
        </span>
        {!onLocal && (
          <div>
            <button
              className="btn btn-secondary btn-sm"
              disabled={switching}
              onClick={() => {
                setSwitching(true);
                wallet
                  .switchToLocalChain()
                  .catch(() => undefined) // rejected in MetaMask: the warning stays
                  .finally(() => setSwitching(false));
              }}
            >
              Switch to {LOCAL_CHAIN.name}
            </button>
          </div>
        )}
      </div>
    </Alert>
  );
}
