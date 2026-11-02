import { useState } from "react";
import type { HistoryItem, HistoryKind } from "../hooks/useBank";
import { formatEth, shortAddress } from "../lib/eth";
import { Alert, EmptyState, Icon, Modal, Skeleton, dayLabel, formatDateTime, formatFullDate, type IconName } from "../ui";
import { CopyButton } from "./Topbar";

const KIND: Record<HistoryKind, { title: string; icon: IconName; incoming: boolean }> = {
  deposit: { title: "Deposit", icon: "arrow-down-left", incoming: true },
  withdrawal: { title: "Withdrawal", icon: "arrow-up-right", incoming: false },
  sent: { title: "Transfer sent", icon: "send", incoming: false },
  received: { title: "Transfer received", icon: "arrow-down-left", incoming: true },
};

const FILTERS: { id: "all" | HistoryKind | "transfers"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposits" },
  { id: "withdrawal", label: "Withdrawals" },
  { id: "transfers", label: "Transfers" },
];

const title = (item: HistoryItem) =>
  item.kind === "sent"
    ? `To ${shortAddress(item.counterparty!)}`
    : item.kind === "received"
      ? `From ${shortAddress(item.counterparty!)}`
      : KIND[item.kind].title;

/** Signed amount from the account's point of view: deposits and incoming transfers add, the rest subtract. */
const signed = (item: HistoryItem) => `${KIND[item.kind].incoming ? "+" : "−"}${formatEth(item.amount, 6)}`;

function Row({ item, onOpen }: { item: HistoryItem; onOpen(item: HistoryItem): void }) {
  const { incoming, icon } = KIND[item.kind];
  return (
    <button className="tx-row" onClick={() => onOpen(item)}>
      <div className={`avatar ${incoming ? "ok" : ""}`}>
        <Icon name={icon} size={19} />
      </div>
      <div className="grow">
        <div className="tx-title">{title(item)}</div>
        <div className="tx-meta">
          <span>{formatDateTime(new Date(item.timestamp).toISOString())}</span>
          <span>· block #{item.blockNumber}</span>
        </div>
      </div>
      <div>
        <div className={`tx-amount ${incoming ? "in" : ""}`}>{signed(item)}</div>
        <div style={{ textAlign: "right", marginTop: 2 }}>
          <span className="badge badge-ok">Completed</span>
        </div>
      </div>
    </button>
  );
}

function Details({ item }: { item: HistoryItem }) {
  const { incoming, icon } = KIND[item.kind];
  return (
    <div className="stack">
      <div className="receipt-hero">
        <div className="status-icon ok">
          <Icon name={icon} size={28} />
        </div>
        <div className="big">{signed(item)}</div>
        <span className="badge badge-ok">Completed on chain</span>
      </div>
      <dl className="kv">
        <div>
          <dt>Type</dt>
          <dd>{KIND[item.kind].title}</dd>
        </div>
        {item.counterparty && (
          <div>
            <dt>{incoming ? "From" : "To"}</dt>
            <dd className="mono">{item.counterparty}</dd>
          </div>
        )}
        {item.balanceAfter !== null && (
          <div>
            <dt>Balance after</dt>
            <dd>{formatEth(item.balanceAfter, 6)}</dd>
          </div>
        )}
        <div>
          <dt>Time</dt>
          <dd>{formatFullDate(new Date(item.timestamp).toISOString())}</dd>
        </div>
        <div>
          <dt>Block</dt>
          <dd>#{item.blockNumber}</dd>
        </div>
        <div>
          <dt>Transaction</dt>
          <dd className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
            <span className="mono">{shortAddress(item.txHash)}</span>
            <CopyButton value={item.txHash} label="transaction hash" />
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Completed transactions of the connected account, read from the contract's event logs. */
export function HistoryCard({ history, error }: { history: HistoryItem[] | null; error: string | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  const visible = (history ?? []).filter((item) =>
    filter === "all" ? true : filter === "transfers" ? item.kind === "sent" || item.kind === "received" : item.kind === filter,
  );

  // Group by calendar day, newest first (the list is already sorted)
  const groups: { day: string; items: HistoryItem[] }[] = [];
  for (const item of visible) {
    const day = dayLabel(new Date(item.timestamp).toISOString());
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <>
      <div className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Transaction history</h2>
            <p className="hint">{history ? `${history.length} completed on chain` : "Reading events…"}</p>
          </div>
        </div>
        <div style={{ padding: "8px 20px 14px" }}>
          <div className="segmented">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: "0 20px 16px" }}>
            <Alert>{error}</Alert>
          </div>
        )}

        {history === null ? (
          <div style={{ padding: 20, display: "grid", gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={42} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon="history" title={history.length === 0 ? "No transactions yet" : "Nothing here"}>
            {history.length === 0 ? "Make a deposit to get started." : "No transactions match this filter."}
          </EmptyState>
        ) : (
          <div className="tx-list">
            {groups.map((g) => (
              <div key={g.day}>
                <div className="day-head">{g.day}</div>
                {g.items.map((item) => (
                  <Row key={item.id} item={item} onOpen={setSelected} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outside the card: its backdrop-filter would trap the fixed overlay inside it */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Transaction">
        {selected && <Details item={selected} />}
      </Modal>
    </>
  );
}
