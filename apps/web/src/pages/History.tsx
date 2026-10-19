import { TRANSACTION_STATUSES, TRANSACTION_TYPES, type Direction, type TransactionStatus, type TransactionType } from "@finnova/shared";
import { useCallback, useEffect, useState } from "react";
import { Receipt, TransactionRow } from "../components/TransactionRow";
import { Alert, EmptyState, Modal, PageHeader, Skeleton, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { dayLabel } from "../lib/format";
import type { Transaction } from "../lib/types";

const TYPE_LABEL: Record<TransactionType, string> = { TOPUP: "Top-ups", TRANSFER: "Transfers", QR_PAYMENT: "QR" };
const STATUS_LABEL: Record<TransactionStatus, string> = { PENDING: "Pending", COMPLETED: "Completed", FAILED: "Failed" };
const PAGE_SIZE = 20;

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T | ""; options: { value: T | ""; label: string }[]; onChange(v: T | ""): void }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? "on" : ""} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function History() {
  const [type, setType] = useState<TransactionType | "">("");
  const [status, setStatus] = useState<TransactionStatus | "">("");
  const [direction, setDirection] = useState<Direction | "">("");

  const [items, setItems] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Transaction | null>(null);

  // (Re)load the first page whenever a filter changes
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError(null);
    api.transactions
      .list({ type: type || undefined, status: status || undefined, direction: direction || undefined, limit: PAGE_SIZE })
      .then((page) => {
        if (stale) return;
        setItems(page.data);
        setCursor(page.nextCursor);
      })
      .catch((err) => !stale && setError(errorMessage(err)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [type, status, direction]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.transactions.list({
        type: type || undefined,
        status: status || undefined,
        direction: direction || undefined,
        limit: PAGE_SIZE,
        before: cursor,
      });
      setItems((prev) => [...prev, ...page.data]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, type, status, direction]);

  // Group by calendar day
  const groups: { label: string; rows: Transaction[] }[] = [];
  for (const tx of items) {
    const label = dayLabel(tx.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(tx);
    else groups.push({ label, rows: [tx] });
  }

  const filtered = type !== "" || status !== "" || direction !== "";

  return (
    <div className="stack-lg">
      <PageHeader title="Activity" subtitle="Every top-up, transfer and QR payment." />

      <div className="row" style={{ flexWrap: "wrap" }}>
        <Segmented<TransactionType | ""> label="Type" value={type} onChange={setType} options={[{ value: "", label: "All types" }, ...TRANSACTION_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
        <Segmented<Direction | ""> label="Direction" value={direction} onChange={setDirection} options={[{ value: "", label: "In & out" }, { value: "IN", label: "Money in" }, { value: "OUT", label: "Money out" }]} />
        <Segmented<TransactionStatus | ""> label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "Any status" }, ...TRANSACTION_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="card card-flush">
        {loading ? (
          <div style={{ padding: 20, display: "grid", gap: 14 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={44} />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="history" title={filtered ? "Nothing matches these filters" : "No activity yet"}>
            {filtered ? "Try removing a filter." : "Your payments will appear here."}
          </EmptyState>
        ) : (
          <div>
            {groups.map((g) => (
              <div key={g.label}>
                <div className="day-head">{g.label}</div>
                <div className="tx-list">
                  {g.rows.map((tx) => <TransactionRow key={tx.id} tx={tx} onOpen={setSelected} />)}
                </div>
              </div>
            ))}
            {cursor && (
              <div style={{ padding: 16, textAlign: "center", borderTop: "1px solid var(--line)" }}>
                <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Spinner /> : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Receipt">
        {selected && <Receipt tx={selected} />}
      </Modal>
    </div>
  );
}
