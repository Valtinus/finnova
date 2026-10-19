import { useState } from "react";
import type { Wallet } from "../lib/types";
import { Icon } from "./Icon";
import { Skeleton } from "./ui";

export function BalanceCard({ wallet }: { wallet: Wallet | null }) {
  const [hidden, setHidden] = useState(false);
  const frozen = wallet?.status === "FROZEN";

  return (
    <div className={`balance-card ${frozen ? "frozen" : ""}`}>
      <div className="balance-top">
        <span>{wallet?.nickname ?? "Main wallet"}</span>
        {frozen ? (
          <span className="pill-light">
            <Icon name="snowflake" size={14} /> Frozen
          </span>
        ) : (
          <span className="pill-light">EUR</span>
        )}
      </div>
      {wallet ? (
        <div className="balance-amount">{hidden ? "€ ••••••" : wallet.balanceFormatted}</div>
      ) : (
        <div style={{ margin: "18px 0 10px" }}>
          <Skeleton height={44} width={200} />
        </div>
      )}
      <div className="row-between">
        <span className="balance-sub">Available balance</span>
        <button
          className="pill-light"
          style={{ border: 0, cursor: "pointer" }}
          onClick={() => setHidden((h) => !h)}
          aria-pressed={hidden}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
    </div>
  );
}
