import { useState } from "react";
import { Skeleton } from "../components/ui";
import { formatEth } from "./eth";
import type { Bank } from "./useBank";

/** The account balance at the bank (checkBalance()), next to the ETH still in the MetaMask wallet. */
export function BankBalanceCard({ bank }: { bank: Bank }) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await bank.refresh();
    setRefreshing(false);
  }

  return (
    <div className="balance-card">
      <div className="balance-top">
        <span>FinNova Bank account</span>
        <span className="pill-light">ETH · on chain</span>
      </div>
      {bank.balance !== null ? (
        <div className="balance-amount" aria-live="polite">
          {hidden ? "•••••• ETH" : formatEth(bank.balance, 6)}
        </div>
      ) : (
        <div style={{ margin: "18px 0 10px" }}>
          <Skeleton height={44} width={220} />
        </div>
      )}
      <div className="row-between">
        <span className="balance-sub">
          Wallet: {bank.walletBalance === null ? "…" : hidden ? "••••" : formatEth(bank.walletBalance)}
        </span>
        <span className="row" style={{ gap: 8 }}>
          <button className="pill-light pill-btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Checking…" : "Check balance"}
          </button>
          <button className="pill-light pill-btn" onClick={() => setHidden((h) => !h)} aria-pressed={hidden}>
            {hidden ? "Show" : "Hide"}
          </button>
        </span>
      </div>
    </div>
  );
}
