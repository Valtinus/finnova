import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Alert, AmountInput, EmptyState, PageHeader, QrStatusBadge, Spinner, amountToCents, useNow } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../lib/api";
import { countdown, formatDateTime } from "../lib/format";
import type { QrRequestWithImage } from "../lib/types";

const EXPIRY = [
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "1 hour", seconds: 3600 },
];

export function Receive() {
  const { wallet, refreshWallet } = useAuth();
  const toast = useToast();
  const history = useAsync(() => api.qr.list(), []);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState(900);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<QrRequestWithImage | null>(null);

  const cents = amountToCents(amount);
  const frozen = wallet?.status === "FROZEN";

  // Poll the request until the payer has paid (or it expires / is cancelled)
  useEffect(() => {
    if (!active || active.status !== "OPEN") return;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.qr.get(active.id);
        if (fresh.status !== "OPEN") {
          setActive(fresh);
          if (fresh.status === "PAID") {
            toast.success(`${fresh.amountFormatted} received`);
            void refreshWallet();
          }
          history.reload();
        }
      } catch {
        /* transient network error: keep polling */
      }
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (cents === null) return;
    setBusy(true);
    setError(null);
    try {
      setActive(await api.qr.create({ amountCents: cents, description: note.trim() || undefined, expiresInSeconds: expiry }));
      history.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!active) return;
    try {
      await api.qr.cancel(active.id);
      setActive({ ...active, status: "CANCELLED" });
      history.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function again() {
    setActive(null);
    setAmount("");
    setNote("");
  }

  return (
    <div className="narrow stack-lg">
      <PageHeader title="Receive money" subtitle="Create a QR code. The payer scans it and pays instantly." />

      {active ? (
        <QrCard request={active} onCancel={cancel} onAgain={again} onCopy={() => navigator.clipboard?.writeText(active.payload).then(() => toast.info("Payload copied"))} />
      ) : (
        <form className="card stack" onSubmit={create}>
          {frozen && <Alert kind="warn">Your wallet is frozen. Unfreeze it to receive money.</Alert>}
          <AmountInput value={amount} onChange={setAmount} autoFocus />
          <div className="field">
            <label htmlFor="note">Description <span className="faint">(optional)</span></label>
            <input id="note" className="input" maxLength={140} placeholder="e.g. Flat white" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label>Valid for</label>
            <div className="segmented" role="group">
              {EXPIRY.map((o) => (
                <button type="button" key={o.seconds} className={expiry === o.seconds ? "on" : ""} onClick={() => setExpiry(o.seconds)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {error && <Alert>{error}</Alert>}
          <button className="btn btn-primary btn-lg btn-block" disabled={!cents || busy || frozen}>
            {busy ? <Spinner /> : (<><Icon name="qr" /> Generate QR code</>)}
          </button>
        </form>
      )}

      <div className="card card-flush">
        <div className="card-head">
          <h2>Your requests</h2>
        </div>
        {history.data && history.data.data.length > 0 ? (
          <div className="tx-list">
            {history.data.data.map((r) => (
              <div key={r.id} className="tx-row" style={{ cursor: "default" }}>
                <div className="avatar"><Icon name="qr" size={19} /></div>
                <div className="grow">
                  <div className="tx-title">{r.description ?? "Payment request"}</div>
                  <div className="tx-meta">{formatDateTime(r.createdAt)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tx-amount">{r.amountFormatted}</div>
                  <QrStatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="qr" title="No requests yet">Your QR payment requests will show up here.</EmptyState>
        )}
      </div>
    </div>
  );
}

function QrCard({ request, onCancel, onAgain, onCopy }: { request: QrRequestWithImage; onCancel(): void; onAgain(): void; onCopy(): void }) {
  const now = useNow();
  const open = request.status === "OPEN" && new Date(request.expiresAt).getTime() > now;
  const paid = request.status === "PAID";

  return (
    <div className="card qr-box">
      <div className="muted">Request for</div>
      <div className="balance-amount" style={{ color: "var(--ink)", margin: 0 }}>{request.amountFormatted}</div>
      {request.description && <div className="muted">{request.description}</div>}

      <div className={`qr-frame ${open ? "" : "dim"}`}>
        <img src={request.qrDataUrl} alt="Payment QR code" />
        {!open && (
          <div className="over">
            <div className={`status-icon ${paid ? "ok" : "warn"}`}>
              <Icon name={paid ? "check-circle" : "clock"} size={32} />
            </div>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="row small muted">
            <Spinner /> Waiting for payment · expires in <span className="num"><strong>{countdown(request.expiresAt, now)}</strong></span>
          </div>
          <div className="row" style={{ width: "100%" }}>
            <button className="btn btn-secondary grow" onClick={onCopy}><Icon name="copy" size={16} /> Copy payload</button>
            <button className="btn btn-danger grow" onClick={onCancel}>Cancel request</button>
          </div>
        </>
      )}
      {!open && (
        <>
          <div className="row">
            <QrStatusBadge status={paid ? "PAID" : request.status === "OPEN" ? "EXPIRED" : request.status} />
            <span className="muted">{paid ? "Payment received" : "This request is no longer valid"}</span>
          </div>
          <button className="btn btn-primary btn-block" onClick={onAgain}>New request</button>
        </>
      )}
    </div>
  );
}
