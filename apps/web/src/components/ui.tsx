import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { initials, parseAmountToCents } from "../lib/format";
import type { Transaction } from "../lib/types";
import { Icon, type IconName } from "./Icon";

/* ---------- small pieces ---------- */

export function Spinner() {
  return <span className="spinner" role="progressbar" aria-label="Loading" />;
}

export function PageSpinner() {
  return (
    <div className="page-spin">
      <Spinner />
    </div>
  );
}

export function Avatar({ name, tone, size }: { name: string; tone?: "ok" | "bad"; size?: "lg" }) {
  return <div className={`avatar ${tone ?? ""} ${size ?? ""}`}>{initials(name) || "?"}</div>;
}

export function Alert({ kind = "bad", children }: { kind?: "bad" | "warn" | "info" | "ok"; children: ReactNode }) {
  const icon: IconName = kind === "ok" ? "check-circle" : kind === "info" ? "info" : "alert";
  return (
    <div className={`alert alert-${kind}`} role={kind === "bad" ? "alert" : undefined}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">
        <Icon name={icon} size={24} />
      </div>
      <strong>{title}</strong>
      {children && <p className="small">{children}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: string | number }) {
  return <div className="skeleton" style={{ height, width }} />;
}

/* ---------- status ---------- */

export function StatusBadge({ status }: { status: Transaction["status"] }) {
  const map = {
    COMPLETED: { cls: "badge-ok", label: "Completed" },
    PENDING: { cls: "badge-warn", label: "Pending" },
    FAILED: { cls: "badge-bad", label: "Failed" },
  } as const;
  const { cls, label } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function QrStatusBadge({ status }: { status: string }) {
  const cls = status === "PAID" ? "badge-ok" : status === "OPEN" ? "badge-brand" : status === "EXPIRED" ? "badge-warn" : "badge-neutral";
  return <span className={`badge ${cls}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

/* ---------- amount input ---------- */

interface AmountInputProps {
  value: string;
  onChange(value: string): void;
  suggestions?: number[];
  autoFocus?: boolean;
}

/** Big centred euro amount field. `value` is the raw text; use parseAmountToCents() to read it. */
export function AmountInput({ value, onChange, suggestions, autoFocus }: AmountInputProps) {
  const id = useId();
  const width = Math.max(2, value.length || 4) + 0.5;
  return (
    <div>
      <div className="amount-input">
        <span className="cur">€</span>
        <input
          id={id}
          style={{ width: `${width}ch` }}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0.00"
          aria-label="Amount in euro"
          value={value}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.,]/g, "");
            if (/^\d{0,7}([.,]\d{0,2})?$/.test(next)) onChange(next);
          }}
        />
      </div>
      {suggestions && (
        <div className="chips">
          {suggestions.map((cents) => (
            <button type="button" key={cents} className="chip-btn" onClick={() => onChange(String(cents / 100))}>
              €{cents / 100}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const amountToCents = (text: string) => parseAmountToCents(text);

/* ---------- modal ---------- */

export function Modal({ open, onClose, title, children }: { open: boolean; onClose(): void; title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        {title && (
          <div className="row-between" style={{ marginBottom: 14 }}>
            <h2>{title}</h2>
            <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------- misc hooks ---------- */

/** Re-renders every second, for countdowns. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
