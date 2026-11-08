import { describeError } from "@finnova/contracts";
import { formatEther, getAddress, isAddress, type ContractTransactionResponse } from "ethers";
import { useEffect, useState, type FormEvent } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Alert, Avatar, Spinner } from "../components/ui";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../lib/api";
import type { ChainParty } from "../lib/types";
import { CopyButton } from "./AddressBits";
import { formatEth, parseEthInput, shortAddress } from "./eth";
import type { Bank } from "./useBank";

type Operation = "deposit" | "withdraw" | "transfer";

const TABS: { id: Operation; label: string; icon: IconName }[] = [
  { id: "deposit", label: "Deposit", icon: "arrow-down-left" },
  { id: "withdraw", label: "Withdraw", icon: "arrow-up-right" },
  { id: "transfer", label: "Transfer", icon: "send" },
];

const HELP: Record<Operation, string> = {
  deposit: "Move ETH from your MetaMask wallet into your FinNova Bank account.",
  withdraw: "Send ETH from your FinNova Bank account back to your wallet.",
  transfer: "Move funds from your FinNova Bank account to another address's account, or to a FinNova customer's linked wallet.",
};

/** Who a transfer goes to: a typed address, or a FinNova customer found by email or phone. */
type Recipient =
  | { state: "empty" }
  | { state: "partial" }
  /** party: the FinNova customer who linked the address; undefined while checking, null if none */
  | { state: "address"; address: string; party: ChainParty | null | undefined }
  | { state: "looking" }
  | { state: "customer"; party: ChainParty }
  | { state: "not-found"; message: string };

/** Resolves the recipient field as the user types (debounced): addresses directly, anything else through the API. */
function useRecipient(text: string): Recipient {
  const [recipient, setRecipient] = useState<Recipient>({ state: "empty" });
  const q = text.trim();

  useEffect(() => {
    if (q === "") return setRecipient({ state: "empty" });
    const typedAddress = isAddress(q) ? getAddress(q) : null;
    if (!typedAddress && (q.toLowerCase().startsWith("0x") || q.length < 3)) return setRecipient({ state: "partial" });
    setRecipient(typedAddress ? { state: "address", address: typedAddress, party: undefined } : { state: "looking" });

    let cancelled = false;
    const timer = setTimeout(() => {
      api.blockchain.lookup(q).then(
        (party) => {
          if (cancelled) return;
          setRecipient(typedAddress ? { state: "address", address: typedAddress, party } : { state: "customer", party });
        },
        (err) => {
          if (cancelled) return;
          // An address nobody linked is fine; an unknown email or phone is not
          setRecipient(
            typedAddress ? { state: "address", address: typedAddress, party: null } : { state: "not-found", message: errorMessage(err) },
          );
        },
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  return recipient;
}

const SUGGESTIONS = ["0.1", "0.5", "1", "5"];

type Phase =
  | { step: "idle" }
  | { step: "signing" }
  | { step: "mining"; hash: string }
  | { step: "done"; summary: string; hash: string; block: number; gasUsed: bigint };

export function OperationsCard({ bank, account }: { bank: Bank; account: string }) {
  const toast = useToast();
  const [operation, setOperation] = useState<Operation>("deposit");
  const [amountText, setAmountText] = useState("");
  const [recipient, setRecipient] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const resolved = useRecipient(operation === "transfer" ? recipient : "");

  const amount = parseEthInput(amountText);
  const recipientAddress =
    resolved.state === "address" ? resolved.address : resolved.state === "customer" ? resolved.party.address : null;
  const recipientName =
    resolved.state === "customer" ? resolved.party.name : resolved.state === "address" ? (resolved.party?.name ?? null) : null;
  const busy = phase.step === "signing" || phase.step === "mining";
  // Deposits come out of the wallet; withdrawals and transfers out of the bank account
  const available = operation === "deposit" ? bank.walletBalance : bank.balance;

  function switchTo(next: Operation) {
    if (busy) return;
    setOperation(next);
    setError(null);
    setPhase({ step: "idle" });
  }

  function validate(): string | null {
    if (amountText.trim() === "") return "Enter an amount.";
    if (amount === null) return "Enter a positive amount in ETH, e.g. 0.5.";
    if (available !== null && amount > available) {
      return operation === "deposit"
        ? `Your wallet only has ${formatEth(available)}.`
        : `Insufficient balance: your FinNova account holds ${formatEth(available)}.`;
    }
    if (operation === "transfer") {
      if (resolved.state === "looking") return "Still looking up the recipient…";
      if (resolved.state === "not-found") return resolved.message;
      if (!recipientAddress) return "Enter a recipient: a full 0x address, or a FinNova customer's email or phone.";
      if (recipientAddress === account) return "You cannot transfer to your own address.";
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem || amount === null) return;

    const to = operation === "transfer" ? recipientAddress : null;
    const toLabel = recipientName ?? (to ? shortAddress(to) : "");
    setPhase({ step: "signing" });
    try {
      let tx: ContractTransactionResponse;
      if (operation === "deposit") tx = await bank.deposit(amount);
      else if (operation === "withdraw") tx = await bank.withdraw(amount);
      else tx = await bank.transfer(to!, amount);

      setPhase({ step: "mining", hash: tx.hash });
      const receipt = await tx.wait();
      if (!receipt) throw new Error("The transaction was dropped.");

      const summary =
        operation === "deposit"
          ? `Deposited ${formatEth(amount)}`
          : operation === "withdraw"
            ? `Withdrew ${formatEth(amount)}`
            : `Sent ${formatEth(amount)} to ${toLabel}`;
      setPhase({ step: "done", summary, hash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed });
      toast.success(`${summary} · block #${receipt.blockNumber}`);
      setAmountText("");
      setRecipient("");
      await bank.refresh();
    } catch (err) {
      setPhase({ step: "idle" });
      setError(describeError(err));
    }
  }

  return (
    <div className="card stack">
      <div className="segmented ops-tabs" role="tablist" aria-label="Operation">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={operation === t.id}
            className={operation === t.id ? "on" : ""}
            onClick={() => switchTo(t.id)}
            disabled={busy && operation !== t.id}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>
      <p className="small muted">{HELP[operation]}</p>

      <form className="stack" onSubmit={submit} noValidate>
        {operation === "transfer" && (
          <div className="field">
            <label htmlFor="recipient">Recipient</label>
            <div className="input-group">
              <Icon name="user" size={18} />
              <input
                id="recipient"
                className="input"
                placeholder="0x… address, or a FinNova email / phone"
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={busy}
              />
            </div>
            <RecipientHint recipient={resolved} />
          </div>
        )}

        <div className="field">
          <div className="row-between">
            <label htmlFor="amount">Amount</label>
            {available !== null && (
              <span className="hint">
                {operation === "deposit" ? "In wallet" : "In account"}: {formatEth(available)}
              </span>
            )}
          </div>
          <div className="eth-input">
            <input
              id="amount"
              className="input num"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amountText}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d.,]/g, "");
                if (/^\d{0,9}([.,]\d{0,18})?$/.test(next)) setAmountText(next);
              }}
              disabled={busy}
            />
            <span>ETH</span>
          </div>
          <div className="chips" style={{ justifyContent: "flex-start" }}>
            {SUGGESTIONS.map((s) => (
              <button type="button" key={s} className="chip-btn" onClick={() => setAmountText(s)} disabled={busy}>
                {s} ETH
              </button>
            ))}
            {operation !== "deposit" && bank.balance !== null && bank.balance > 0n && (
              <button type="button" className="chip-btn" onClick={() => setAmountText(formatEther(bank.balance!))} disabled={busy}>
                Max
              </button>
            )}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {phase.step === "signing" ? (
            <>
              <Spinner /> Confirm in MetaMask…
            </>
          ) : phase.step === "mining" ? (
            <>
              <Spinner /> Waiting for the block…
            </>
          ) : (
            <>
              <Icon name={TABS.find((t) => t.id === operation)!.icon} size={18} /> {TABS.find((t) => t.id === operation)!.label}
            </>
          )}
        </button>
      </form>

      {phase.step === "mining" && <p className="hint mono ellipsis">Submitted {phase.hash}</p>}
      {phase.step === "done" && (
        <div className="receipt-box">
          <div className="row" style={{ gap: 10 }}>
            <span className="status-icon ok small-icon">
              <Icon name="check-circle" size={18} />
            </span>
            <div className="grow">
              <strong>{phase.summary}</strong>
              <div className="hint">
                Confirmed in block #{phase.block} · {phase.gasUsed.toLocaleString("en-US")} gas
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <span className="mono ellipsis faint grow">{phase.hash}</span>
            <CopyButton value={phase.hash} label="transaction hash" />
          </div>
        </div>
      )}
    </div>
  );
}


function RecipientHint({ recipient }: { recipient: Recipient }) {
  if (recipient.state === "looking") {
    return (
      <span className="hint row" style={{ gap: 6 }}>
        <Spinner /> Looking up the FinNova customer…
      </span>
    );
  }
  if (recipient.state === "not-found") return <span className="hint" style={{ color: "var(--bad)" }}>{recipient.message}</span>;
  const party = recipient.state === "customer" ? recipient.party : recipient.state === "address" ? recipient.party : null;
  if (party) {
    return (
      <div className="recipient" style={{ padding: 10, gap: 10 }}>
        <Avatar name={party.name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <strong>{party.name}</strong> <span className="badge badge-brand">FinNova</span>
          <div className="small faint mono ellipsis">{party.address}</div>
        </div>
      </div>
    );
  }
  if (recipient.state === "address" && recipient.party === null) {
    return <span className="hint">Not a FinNova customer's wallet. Check the address before sending.</span>;
  }
  if (recipient.state === "address") return <span className="hint">Valid address</span>;
  return <span className="hint">FinNova customers who linked a wallet can be found by email or phone.</span>;
}
