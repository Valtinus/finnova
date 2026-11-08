import { describeError } from "@finnova/contracts";
import { formatEther, getAddress, isAddress, type ContractTransactionResponse } from "ethers";
import { useState, type FormEvent } from "react";
import type { Bank } from "../hooks/useBank";
import { formatEth, parseEthInput, shortAddress } from "../lib/eth";
import { Alert, Icon, Spinner, useToast, type IconName } from "../ui";
import { CopyButton } from "./Topbar";

type Operation = "deposit" | "withdraw" | "transfer";

const TABS: { id: Operation; label: string; icon: IconName }[] = [
  { id: "deposit", label: "Deposit", icon: "arrow-down-left" },
  { id: "withdraw", label: "Withdraw", icon: "arrow-up-right" },
  { id: "transfer", label: "Transfer", icon: "send" },
];

const HELP: Record<Operation, string> = {
  deposit: "Move ETH from your MetaMask wallet into your FinNova Bank account.",
  withdraw: "Send ETH from your FinNova Bank account back to your wallet.",
  transfer: "Move funds from your FinNova Bank account to another address's account.",
};

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

  const amount = parseEthInput(amountText);
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
      if (!isAddress(recipient.trim())) return "Enter a valid recipient address (0x…).";
      if (getAddress(recipient.trim()) === account) return "You cannot transfer to your own address.";
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem || amount === null) return;

    const to = operation === "transfer" ? getAddress(recipient.trim()) : null;
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
            : `Sent ${formatEth(amount)} to ${shortAddress(to!)}`;
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
            <label htmlFor="recipient">Recipient address</label>
            <div className="input-group">
              <Icon name="user" size={18} />
              <input
                id="recipient"
                className="input mono"
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={busy}
              />
            </div>
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

