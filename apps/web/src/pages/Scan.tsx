import { Scanner } from "@yudiel/react-qr-scanner";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Receipt } from "../components/TransactionRow";
import { Alert, Avatar, PageHeader, Spinner } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useIdempotencyKey } from "../hooks/useIdempotencyKey";
import { ApiError, api, errorMessage } from "../lib/api";
import { formatCents } from "../lib/format";
import type { QrRequest, Transaction } from "../lib/types";

export function Scan() {
  const { wallet, refreshWallet } = useAuth();
  const key = useIdempotencyKey();

  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [payload, setPayload] = useState<string | null>(null);
  const [preview, setPreview] = useState<QrRequest | null>(null);
  const [result, setResult] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frozen = wallet?.status === "FROZEN";

  async function resolve(text: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCamera(false);
    try {
      const request = await api.qr.resolve(text.trim());
      setPayload(text.trim());
      setPreview(request);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await api.qr.pay(payload, key.current());
      key.renew();
      setResult(tx);
      void refreshWallet();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) key.renew();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPayload(null);
    setPreview(null);
    setResult(null);
    setManual("");
    setError(null);
  }

  if (result) {
    return (
      <div className="narrow stack-lg">
        <PageHeader title="Payment sent" subtitle={`You paid ${preview?.payee.name}.`} />
        <div className="card"><Receipt tx={result} /></div>
        <div className="row">
          <Link to="/" className="btn btn-secondary grow">Back home</Link>
          <button className="btn btn-primary grow" onClick={reset}>Scan another</button>
        </div>
      </div>
    );
  }

  if (preview) {
    const insufficient = wallet !== null && preview.amountCents > wallet.balanceCents;
    return (
      <div className="narrow stack-lg">
        <PageHeader title="Confirm payment" subtitle="Check the details before you pay." />
        <div className="card stack">
          <div className="receipt-hero">
            <Avatar name={preview.payee.name} size="lg" />
            <div className="muted">Pay</div>
            <div className="big">{formatCents(preview.amountCents)}</div>
            <div>to <strong>{preview.payee.name}</strong></div>
          </div>
          <dl className="kv" style={{ margin: 0 }}>
            {preview.description && <div><dt>For</dt><dd>{preview.description}</dd></div>}
            <div><dt>Payee</dt><dd>{preview.payee.email}</dd></div>
            <div><dt>Your balance</dt><dd className="num">{wallet?.balanceFormatted}</dd></div>
          </dl>
          {preview.status !== "OPEN" && <Alert kind="warn">This payment request is {preview.status.toLowerCase()}.</Alert>}
          {insufficient && <Alert kind="warn">Your balance is too low for this payment. <Link to="/topup">Top up</Link></Alert>}
          {frozen && <Alert kind="warn">Your wallet is frozen.</Alert>}
          {error && <Alert>{error}</Alert>}
          <div className="row">
            <button className="btn btn-secondary grow" disabled={busy} onClick={reset}>Cancel</button>
            <button className="btn btn-primary grow" disabled={busy || preview.status !== "OPEN" || frozen} onClick={pay}>
              {busy ? <Spinner /> : `Pay ${formatCents(preview.amountCents)}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    void resolve(manual);
  }

  return (
    <div className="narrow stack-lg">
      <PageHeader title="Scan & pay" subtitle="Scan a FinNova QR code to pay a friend or merchant." />
      <div className="card stack">
        {camera ? (
          <>
            <div className="scanner">
              <Scanner
                onScan={(codes) => {
                  const value = codes[0]?.rawValue;
                  if (value) void resolve(value);
                }}
                onError={(err) => {
                  setCamera(false);
                  setError(err instanceof Error ? `Camera unavailable: ${err.message}` : "Camera unavailable");
                }}
                constraints={{ facingMode: "environment" }}
                components={{ finder: false }}
                styles={{ container: { width: "100%", height: "100%" } }}
              />
            </div>
            <button className="btn btn-secondary" onClick={() => setCamera(false)}>Stop camera</button>
          </>
        ) : (
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => { setError(null); setCamera(true); }}>
            <Icon name="scan" /> Open camera
          </button>
        )}
        {error && <Alert>{error}</Alert>}
      </div>

      <form className="card stack" onSubmit={submitManual}>
        <div className="field">
          <label htmlFor="payload">Or paste a QR payload</label>
          <textarea id="payload" className="input mono" rows={3} placeholder="finnova://pay?rid=…&sig=…" value={manual} onChange={(e) => setManual(e.target.value)} />
          <span className="hint">Handy on a desktop: copy the payload from the Receive screen of another account.</span>
        </div>
        <button className="btn btn-secondary" disabled={busy || manual.trim().length < 10}>
          {busy ? <Spinner /> : "Preview payment"}
        </button>
      </form>
    </div>
  );
}
