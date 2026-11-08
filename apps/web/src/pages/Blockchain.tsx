import { useState } from "react";
import { BankBalanceCard } from "../blockchain/BankBalanceCard";
import { ContractCard } from "../blockchain/ContractCard";
import { HistoryCard } from "../blockchain/HistoryCard";
import { LinkCard } from "../blockchain/LinkCard";
import { OperationsCard } from "../blockchain/OperationsCard";
import { LOCAL_CHAIN, chainName } from "../blockchain/eth";
import { useBank } from "../blockchain/useBank";
import { useChainAccount } from "../blockchain/useChainAccount";
import { useContractAddress } from "../blockchain/useContractAddress";
import { useMetaMask, type MetaMask } from "../blockchain/useMetaMask";
import "../blockchain/blockchain.css";
import { Icon } from "../components/Icon";
import { Alert, PageHeader, Skeleton } from "../components/ui";

/**
 * The FinNova Bank DApp inside the banking app: the signed-in customer connects MetaMask, links it
 * to their FinNova account, and uses the FinNova Bank smart contract. Loaded lazily (ethers is big).
 */
export default function BlockchainPage() {
  const metaMask = useMetaMask();
  const chain = useChainAccount();
  const contract = useContractAddress();
  const bank = useBank(metaMask, contract.address);
  const connected = metaMask.status === "connected" && !!metaMask.account;
  const ready = connected && bank.contractState === "ready";

  return (
    <div className="stack-lg chain-page">
      <PageHeader
        title="Blockchain"
        subtitle="Your FinNova Bank account on the blockchain: deposit, withdraw and transfer ether through the smart contract."
      />

      {connected && <ContractProblem metaMask={metaMask} state={bank.contractState} address={contract.address} />}

      <div className="grid-2">
        <div className="stack">
          <LinkCard metaMask={metaMask} chain={chain} />
          {connected && bank.contractState === "checking" && <Skeleton height={180} />}
          {ready && (
            <>
              <BankBalanceCard bank={bank} />
              <OperationsCard bank={bank} account={metaMask.account!} />
            </>
          )}
          {connected && (
            <ContractCard
              bank={bank}
              address={contract.address}
              fromEnv={contract.fromEnv}
              chainId={metaMask.chainId}
              onChange={contract.save}
            />
          )}
        </div>
        {ready ? <HistoryCard history={bank.history} error={bank.error} /> : <HowItWorks />}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="card stack">
      <h2>How it works</h2>
      <div className="steps-list">
        <div>
          <span className="ico"><Icon name="wallet" size={18} /></span>
          <div>
            <strong>Connect MetaMask</strong>
            <p className="small muted">Your keys stay in MetaMask. You approve every transaction there.</p>
          </div>
        </div>
        <div>
          <span className="ico"><Icon name="link" size={18} /></span>
          <div>
            <strong>Link it to your FinNova account</strong>
            <p className="small muted">Sign a message to prove the wallet is yours. Customers can then pay you by email or phone.</p>
          </div>
        </div>
        <div>
          <span className="ico"><Icon name="arrow-down-left" size={18} /></span>
          <div>
            <strong>Deposit, withdraw, transfer</strong>
            <p className="small muted">The FinNova Bank smart contract keeps your balance. Every operation is a transaction on the chain.</p>
          </div>
        </div>
        <div>
          <span className="ico"><Icon name="history" size={18} /></span>
          <div>
            <strong>Full history on chain</strong>
            <p className="small muted">The history is read back from the contract's events, with FinNova names where known.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Explains why the page can't reach the contract: no address configured, or nothing deployed there on this network. */
function ContractProblem({ metaMask, state, address }: { metaMask: MetaMask; state: string; address: string | null }) {
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

  const onLocal = metaMask.chainId === LOCAL_CHAIN.chainId;
  return (
    <Alert kind="warn">
      <div className="stack" style={{ gap: 10 }}>
        <span>
          There is no FinNovaBank contract at <code>{address}</code> on {metaMask.chainId === null ? "this network" : chainName(metaMask.chainId)}.{" "}
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
                metaMask
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
