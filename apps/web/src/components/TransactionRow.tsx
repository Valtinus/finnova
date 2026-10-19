import { failureText, formatCents, formatDateTime, signedMoney } from "../lib/format";
import type { Transaction } from "../lib/types";
import { Icon, type IconName } from "./Icon";
import { StatusBadge } from "./ui";

const TYPE_LABEL: Record<Transaction["type"], string> = {
  TOPUP: "Card top-up",
  TRANSFER: "Transfer",
  QR_PAYMENT: "QR payment",
};

export function txTitle(tx: Transaction): string {
  if (tx.type === "TOPUP") return "Card top-up";
  const name = tx.counterparty?.name ?? "Unknown";
  return tx.direction === "OUT" ? `To ${name}` : `From ${name}`;
}

export function txIcon(tx: Transaction): IconName {
  if (tx.type === "TOPUP") return "card";
  if (tx.type === "QR_PAYMENT") return "qr";
  return tx.direction === "OUT" ? "arrow-up-right" : "arrow-down-left";
}

export const txTypeLabel = (tx: Transaction) => TYPE_LABEL[tx.type];

export function TxIcon({ tx }: { tx: Transaction }) {
  const tone = tx.status === "FAILED" ? "bad" : tx.direction === "IN" && tx.status === "COMPLETED" ? "ok" : "";
  return (
    <div className={`avatar ${tone}`}>
      <Icon name={txIcon(tx)} size={19} />
    </div>
  );
}

export function TransactionRow({ tx, onOpen }: { tx: Transaction; onOpen?(tx: Transaction): void }) {
  const amount = signedMoney(tx.signedAmountCents);
  const failed = tx.status === "FAILED";
  return (
    <button className="tx-row" onClick={() => onOpen?.(tx)}>
      <TxIcon tx={tx} />
      <div className="grow">
        <div className="tx-title">{txTitle(tx)}</div>
        <div className="tx-meta">
          {tx.description && <span className="ellipsis">{tx.description} ·</span>}
          <span>{formatDateTime(tx.createdAt)}</span>
        </div>
      </div>
      <div>
        <div className={`tx-amount ${tx.direction === "IN" && !failed ? "in" : ""} ${failed ? "failed" : ""}`}>{amount}</div>
        {tx.status !== "COMPLETED" && (
          <div style={{ textAlign: "right", marginTop: 2 }}>
            <StatusBadge status={tx.status} />
          </div>
        )}
      </div>
    </button>
  );
}

/** Full receipt shown in a modal. */
export function Receipt({ tx }: { tx: Transaction }) {
  const tone = tx.status === "COMPLETED" ? "ok" : tx.status === "FAILED" ? "bad" : "warn";
  const icon: IconName = tx.status === "COMPLETED" ? "check-circle" : tx.status === "FAILED" ? "alert" : "clock";
  return (
    <div>
      <div className="receipt-hero">
        <div className={`status-icon ${tone}`}>
          <Icon name={icon} size={30} />
        </div>
        <div className="big">{signedMoney(tx.signedAmountCents)}</div>
        <div className="muted">{txTitle(tx)}</div>
        <StatusBadge status={tx.status} />
      </div>
      {tx.failureReason && (
        <div className="alert alert-bad" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={18} />
          <div>{failureText(tx.failureReason)}</div>
        </div>
      )}
      <dl className="kv" style={{ margin: 0 }}>
        <div>
          <dt>Reference</dt>
          <dd className="mono">{tx.reference}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{txTypeLabel(tx)}</dd>
        </div>
        {tx.counterparty && tx.type !== "TOPUP" && (
          <div>
            <dt>{tx.direction === "OUT" ? "Recipient" : "Sender"}</dt>
            <dd>
              {tx.counterparty.name}
              {tx.counterparty.email && <div className="faint small">{tx.counterparty.email}</div>}
            </dd>
          </div>
        )}
        {tx.description && tx.description !== txTitle(tx) && (
          <div>
            <dt>Note</dt>
            <dd>{tx.description}</dd>
          </div>
        )}
        <div>
          <dt>Amount</dt>
          <dd className="num">{formatCents(tx.amountCents)}</dd>
        </div>
        <div>
          <dt>Payment rail</dt>
          <dd>{tx.rail}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(tx.createdAt)}</dd>
        </div>
        {tx.completedAt && (
          <div>
            <dt>Completed</dt>
            <dd>{formatDateTime(tx.completedAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
