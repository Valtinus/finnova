import { LIMITS } from "@finnova/shared";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Receipt } from "../components/TransactionRow";
import { Alert, Avatar, AmountInput, PageHeader, Spinner, amountToCents } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useIdempotencyKey } from "../hooks/useIdempotencyKey";
import { ApiError, api, errorMessage } from "../lib/api";
import { formatCents } from "../lib/format";
import type { Party, Transaction } from "../lib/types";

type Step = "recipient" | "amount" | "review" | "done";
const STEPS: Step[] = ["recipient", "amount", "review"];

export function Send() {
  const { wallet, refreshWallet } = useAuth();
  const key = useIdempotencyKey();

  const [step, setStep] = useState<Step>("recipient");
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<Party | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Transaction | null>(null);

  const cents = amountToCents(amount);
  const frozen = wallet?.status === "FROZEN";
  const overBalance = cents !== null && wallet !== null && cents > wallet.balanceCents;
  const overLimit = cents !== null && cents > LIMITS.maxTransferCents;
  const amountOk = cents !== null && cents >= LIMITS.minAmountCents && !overBalance && !overLimit;

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRecipient(await api.customers.lookup(query.trim()));
      setStep("amount");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "No FinNova customer matches that email or phone number." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!recipient?.customerId || cents === null) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await api.transfers.create(
        { to: recipient.customerId, amountCents: cents, description: note.trim() || undefined },
        key.current(),
      );
      key.renew();
      setResult(tx);
      setStep("done");
      void refreshWallet();
    } catch (err) {
      // A definitive API answer (not a lost connection) means the next attempt must be a new payment
      if (err instanceof ApiError && err.status !== 0) key.renew();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("recipient");
    setQuery("");
    setRecipient(null);
    setAmount("");
    setNote("");
    setResult(null);
    setError(null);
  }

  if (step === "done" && result) {
    return (
      <div className="narrow stack-lg">
        <PageHeader title="Money sent" subtitle={`${formatCents(result.amountCents)} is on its way to ${recipient?.name}.`} />
        <div className="card">
          <Receipt tx={result} />
        </div>
        <div className="row">
          <Link to="/" className="btn btn-secondary grow">Back home</Link>
          <button className="btn btn-primary grow" onClick={reset}>Send again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow stack-lg">
      <PageHeader title="Send money" subtitle="Instant transfers to any FinNova customer." />
      <div className="steps" aria-hidden="true">
        {STEPS.map((s) => (
          <i key={s} className={STEPS.indexOf(s) <= STEPS.indexOf(step) ? "on" : ""} />
        ))}
      </div>

      {frozen && <Alert kind="warn">Your wallet is frozen. Unfreeze it to send money.</Alert>}

      {step === "recipient" && (
        <form className="card stack" onSubmit={lookup}>
          <div className="field">
            <label htmlFor="to">Who are you sending to?</label>
            <div className="input-group">
              <Icon name="search" size={18} />
              <input id="to" className="input" autoFocus required minLength={3} placeholder="Email or phone number" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <span className="hint">Try bob@finnova.test or +36302222222</span>
          </div>
          {error && <Alert>{error}</Alert>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || query.trim().length < 3}>
            {busy ? <Spinner /> : "Continue"}
          </button>
        </form>
      )}

      {step === "amount" && recipient && (
        <div className="card stack">
          <div className="recipient">
            <Avatar name={recipient.name} />
            <div className="grow">
              <strong>{recipient.name}</strong>
              <div className="small faint">{recipient.email}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep("recipient")}>Change</button>
          </div>
          <AmountInput value={amount} onChange={setAmount} autoFocus />
          <p className="center small muted">Available: {wallet?.balanceFormatted}</p>
          {overBalance && <Alert kind="warn">That is more than your available balance.</Alert>}
          {overLimit && <Alert kind="warn">The limit is {formatCents(LIMITS.maxTransferCents)} per transfer.</Alert>}
          <div className="field">
            <label htmlFor="note">Note <span className="faint">(optional)</span></label>
            <input id="note" className="input" maxLength={140} placeholder="What is it for?" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={!amountOk || frozen} onClick={() => { setError(null); setStep("review"); }}>
            Review
          </button>
        </div>
      )}

      {step === "review" && recipient && cents !== null && (
        <div className="card stack">
          <div className="receipt-hero">
            <Avatar name={recipient.name} size="lg" />
            <div className="muted">You are sending</div>
            <div className="big">{formatCents(cents)}</div>
            <div>
              to <strong>{recipient.name}</strong>
            </div>
          </div>
          <dl className="kv" style={{ margin: 0 }}>
            <div><dt>Recipient</dt><dd>{recipient.email}</dd></div>
            {note.trim() && <div><dt>Note</dt><dd>{note.trim()}</dd></div>}
            <div><dt>Fee</dt><dd>Free</dd></div>
            <div><dt>Balance after</dt><dd className="num">{wallet ? formatCents(wallet.balanceCents - cents) : "-"}</dd></div>
          </dl>
          {error && <Alert>{error}</Alert>}
          <div className="row">
            <button className="btn btn-secondary grow" disabled={busy} onClick={() => setStep("amount")}>Back</button>
            <button className="btn btn-primary grow" disabled={busy} onClick={send}>
              {busy ? <Spinner /> : `Send ${formatCents(cents)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
