import { useEffect, useState, type FormEvent } from "react";
import { BalanceCard } from "../components/BalanceCard";
import { Icon } from "../components/Icon";
import { Alert, EmptyState, Modal, PageHeader, Spinner } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../lib/api";
import { formatCents, formatDateTime, signedMoney } from "../lib/format";
import type { LedgerEntry } from "../lib/types";

const LEDGER_PAGE = 25;

export function WalletPage() {
  const { wallet, setWallet, refreshWallet } = useAuth();
  const toast = useToast();

  const [nickname, setNickname] = useState(wallet?.nickname ?? "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmFreeze, setConfirmFreeze] = useState(false);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const ledger = useAsync(() => api.wallet.ledger(LEDGER_PAGE), []);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);
  useEffect(() => setNickname(wallet?.nickname ?? ""), [wallet?.nickname]);
  useEffect(() => {
    if (!ledger.data) return;
    setEntries(ledger.data.data);
    setMore(ledger.data.data.length === LEDGER_PAGE);
  }, [ledger.data]);

  const frozen = wallet?.status === "FROZEN";

  async function saveNickname(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      setWallet(await api.wallet.update({ nickname: nickname.trim() || null }));
      toast.success("Wallet renamed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: "ACTIVE" | "FROZEN") {
    setToggling(true);
    try {
      setWallet(await api.wallet.update({ status }));
      toast.success(status === "FROZEN" ? "Wallet frozen" : "Wallet unfrozen");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToggling(false);
      setConfirmFreeze(false);
    }
  }

  async function loadMore() {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await api.wallet.ledger(LEDGER_PAGE, last.id);
      setEntries((prev) => [...prev, ...page.data]);
      setMore(page.data.length === LEDGER_PAGE);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const credits = entries.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountCents, 0);
  const debits = entries.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div className="stack-lg">
      <PageHeader title="Wallet" subtitle="Manage your wallet and review your statement." />

      <div className="grid-2">
        <div className="stack">
          <BalanceCard wallet={wallet} />

          <form className="card stack" onSubmit={saveNickname}>
            <div className="field">
              <label htmlFor="nick">Wallet name</label>
              <div className="row">
                <input id="nick" className="input" maxLength={40} placeholder="Main wallet" value={nickname} onChange={(e) => setNickname(e.target.value)} />
                <button className="btn btn-secondary" disabled={saving || nickname.trim() === (wallet?.nickname ?? "")}>
                  {saving ? <Spinner /> : "Save"}
                </button>
              </div>
            </div>
          </form>

          <div className="card stack">
            <div className="row-between">
              <div className="row">
                <div className={`avatar ${frozen ? "bad" : ""}`}><Icon name="snowflake" size={19} /></div>
                <div>
                  <strong>{frozen ? "Wallet is frozen" : "Freeze wallet"}</strong>
                  <div className="small muted">A frozen wallet can neither send nor receive money.</div>
                </div>
              </div>
              <label className="switch">
                <input type="checkbox" role="switch" checked={frozen} disabled={toggling || !wallet} aria-label="Freeze wallet" onChange={() => (frozen ? setStatus("ACTIVE") : setConfirmFreeze(true))} />
                <span />
              </label>
            </div>
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-head">
            <h2>Statement</h2>
          </div>
          <div className="stat-row" style={{ padding: "8px 20px 14px", gridTemplateColumns: "1fr 1fr" }}>
            <div className="stat"><div className="label">Money in</div><div className="value" style={{ color: "var(--ok)" }}>{formatCents(credits)}</div></div>
            <div className="stat"><div className="label">Money out</div><div className="value">{formatCents(debits)}</div></div>
          </div>
          {ledger.error ? (
            <div style={{ padding: 20 }}><Alert>{ledger.error}</Alert></div>
          ) : ledger.loading && entries.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--brand)" }}><Spinner /></div>
          ) : entries.length === 0 ? (
            <EmptyState icon="wallet" title="No ledger entries yet">Entries appear as soon as money moves.</EmptyState>
          ) : (
            <div>
              {entries.map((e) => (
                <div key={e.id} className="ledger-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.direction === "CREDIT" ? "Credit" : "Debit"}</div>
                    <div className="small faint">{formatDateTime(e.createdAt)}</div>
                  </div>
                  <div className="tx-amount" style={{ color: e.direction === "CREDIT" ? "var(--ok)" : undefined }}>
                    {signedMoney(e.direction === "CREDIT" ? e.amountCents : -e.amountCents)}
                  </div>
                  <div className="ledger-bal num small">{e.balanceAfterCents === null ? "" : formatCents(e.balanceAfterCents)}</div>
                </div>
              ))}
              {more && (
                <div style={{ padding: 16, textAlign: "center", borderTop: "1px solid var(--line)" }}>
                  <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <Spinner /> : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={confirmFreeze} onClose={() => setConfirmFreeze(false)} title="Freeze your wallet?">
        <div className="stack">
          <p className="muted">While frozen, you cannot send, pay, top up or receive money. You can unfreeze it at any time.</p>
          <div className="row">
            <button className="btn btn-secondary grow" onClick={() => setConfirmFreeze(false)}>Keep active</button>
            <button className="btn btn-primary grow" style={{ background: "var(--bad)" }} disabled={toggling} onClick={() => setStatus("FROZEN")}>
              {toggling ? <Spinner /> : "Freeze wallet"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
