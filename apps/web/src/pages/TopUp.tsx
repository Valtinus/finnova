import { LIMITS } from "@finnova/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Receipt } from "../components/TransactionRow";
import { Alert, AmountInput, PageHeader, PageSpinner, Spinner, amountToCents } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useIdempotencyKey } from "../hooks/useIdempotencyKey";
import { api, errorMessage } from "../lib/api";
import { failureText, formatCents } from "../lib/format";
import type { Transaction } from "../lib/types";

const SUGGESTIONS = [1000, 2500, 5000, 10000];
const TEST_CARDS = [
  { number: "4242 4242 4242 4242", result: "Success" },
  { number: "4000 0000 0000 0002", result: "Declined" },
  { number: "4000 0000 0000 9995", result: "Insufficient funds" },
  { number: "4000 0000 0000 0069", result: "Expired card" },
];

export function TopUp() {
  const [params, setParams] = useSearchParams();
  const returned = params.get("topup");
  if (returned) return <TopUpResult id={returned} onDone={() => setParams({})} />;
  return <TopUpForm />;
}

function TopUpForm() {
  const { wallet } = useAuth();
  const key = useIdempotencyKey();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = amountToCents(amount);
  const frozen = wallet?.status === "FROZEN";
  const tooMuch = cents !== null && cents > LIMITS.maxTopupCents;
  const valid = cents !== null && cents >= LIMITS.minAmountCents && !tooMuch;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || cents === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.topups.create(
        { amountCents: cents, returnUrl: `${window.location.origin}/topup` },
        key.current(),
      );
      key.renew();
      if (!res.checkoutUrl) throw new Error("The payment gateway did not return a checkout page");
      // Hand over to the payment gateway's hosted checkout; it redirects back with ?topup=<id>&status=...
      window.location.assign(res.checkoutUrl);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="narrow stack-lg">
      <PageHeader title="Top up" subtitle="Add money to your wallet with a card." />
      <form className="card stack" onSubmit={submit}>
        {frozen && <Alert kind="warn">Your wallet is frozen. Unfreeze it to top up.</Alert>}
        <AmountInput value={amount} onChange={setAmount} suggestions={SUGGESTIONS} autoFocus />
        {tooMuch && <Alert kind="warn">The limit is {formatCents(LIMITS.maxTopupCents)} per top-up.</Alert>}
        {error && <Alert>{error}</Alert>}
        <button className="btn btn-primary btn-lg btn-block" disabled={!valid || busy || frozen}>
          {busy ? <Spinner /> : (<><Icon name="card" /> Continue to secure checkout</>)}
        </button>
        <p className="hint center">You will be redirected to our payment gateway to enter your card details.</p>
      </form>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <Icon name="info" size={18} />
          <strong>Demo test cards</strong>
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>Use any future expiry date and any 3-digit CVC.</p>
        <dl className="kv" style={{ margin: 0 }}>
          {TEST_CARDS.map((c) => (
            <div key={c.number}>
              <dt className="mono">{c.number}</dt>
              <dd>{c.result}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Landing page after the gateway checkout. The webhook may arrive a moment after the redirect, so poll briefly. */
function TopUpResult({ id, onDone }: { id: string; onDone(): void }) {
  const { refreshWallet } = useAuth();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    async function poll() {
      try {
        const next = await api.topups.get(id);
        if (cancelled) return;
        setTx(next);
        if (next.status === "PENDING" && ++attempts < 10) setTimeout(poll, 1000);
        else void refreshWallet();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [id, refreshWallet]);

  if (error) {
    return (
      <div className="narrow stack">
        <Alert>{error}</Alert>
        <button className="btn btn-secondary" onClick={onDone}>Back</button>
      </div>
    );
  }
  if (!tx) return <PageSpinner />;

  return (
    <div className="narrow stack-lg">
      <PageHeader
        title={tx.status === "COMPLETED" ? "Top-up complete" : tx.status === "FAILED" ? "Top-up failed" : "Processing payment"}
        subtitle={
          tx.status === "COMPLETED"
            ? "The money is in your wallet."
            : tx.status === "FAILED"
              ? (failureText(tx.failureReason) ?? "The payment could not be completed.")
              : "Waiting for the gateway to confirm your payment…"
        }
      />
      <div className="card">
        <Receipt tx={tx} />
      </div>
      <div className="row">
        <Link to="/" className="btn btn-secondary grow">Back home</Link>
        <button className="btn btn-primary grow" onClick={onDone}>
          {tx.status === "FAILED" ? "Try again" : "Top up again"}
        </button>
      </div>
    </div>
  );
}
