import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BalanceCard } from "../components/BalanceCard";
import { Icon, type IconName } from "../components/Icon";
import { Receipt, TransactionRow } from "../components/TransactionRow";
import { Alert, EmptyState, Modal, Skeleton } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { Transaction } from "../lib/types";

const ACTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: "/topup", label: "Top up", icon: "plus" },
  { to: "/send", label: "Send", icon: "send" },
  { to: "/receive", label: "Receive", icon: "qr" },
  { to: "/scan", label: "Scan", icon: "scan" },
];

export function Dashboard() {
  const { customer, wallet, refreshWallet } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const recent = useAsync(() => api.transactions.list({ limit: 6 }), []);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  const frozen = wallet?.status === "FROZEN";
  const firstName = customer?.fullName.split(" ")[0];

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Hi, {firstName} 👋</h1>
          <p>Here is what is happening with your money.</p>
        </div>
      </div>

      {frozen && (
        <Alert kind="warn">
          Your wallet is frozen. You cannot send or receive money until you <Link to="/wallet">unfreeze it</Link>.
        </Alert>
      )}

      <div className="grid-2">
        <div className="stack">
          <BalanceCard wallet={wallet} />
          <div className="actions" style={{ marginTop: 0 }}>
            {ACTIONS.map((a) => (
              <button key={a.to} className="action" aria-disabled={frozen} onClick={() => navigate(a.to)}>
                <span className="ico">
                  <Icon name={a.icon} size={20} />
                </span>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-head">
            <h2>Recent activity</h2>
            <Link to="/history" className="small">View all</Link>
          </div>
          {recent.loading && !recent.data ? (
            <div style={{ padding: 20, display: "grid", gap: 14 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={42} />
              ))}
            </div>
          ) : recent.error ? (
            <div style={{ padding: 20 }}>
              <Alert>{recent.error}</Alert>
            </div>
          ) : recent.data && recent.data.data.length > 0 ? (
            <div className="tx-list">
              {recent.data.data.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} onOpen={setSelected} />
              ))}
            </div>
          ) : (
            <EmptyState icon="history" title="No activity yet">
              Top up your wallet to get started.
            </EmptyState>
          )}
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Receipt">
        {selected && <Receipt tx={selected} />}
      </Modal>
    </div>
  );
}
