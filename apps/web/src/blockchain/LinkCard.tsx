import { useState } from "react";
import { Icon } from "../components/Icon";
import { Alert, Skeleton, Spinner } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { formatFullDate } from "../lib/format";
import { AddressAvatar, CopyButton, NetworkPill } from "./AddressBits";
import { LOCAL_CHAIN, shortAddress } from "./eth";
import { chainErrorMessage, type ChainLink } from "./useChainAccount";
import type { MetaMask } from "./useMetaMask";

/**
 * The bridge between the FinNova account and the blockchain: connect MetaMask, then link its
 * address to the signed-in customer by signing a message the API checks.
 */
export function LinkCard({ metaMask, chain }: { metaMask: MetaMask; chain: ChainLink }) {
  const { customer } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linked = chain.account;
  const current = metaMask.account;
  const matches = !!linked && !!current && linked.address.toLowerCase() === current.toLowerCase();

  async function link() {
    setBusy("link");
    setError(null);
    try {
      const account = await chain.link(metaMask);
      toast.success(`Wallet ${shortAddress(account.address)} linked to your FinNova account`);
    } catch (e) {
      setError(chainErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    setBusy("unlink");
    setError(null);
    try {
      await chain.unlink();
      toast.success("Wallet unlinked");
    } catch (e) {
      setError(chainErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card stack">
      <div className="row-between">
        <div>
          <h2>Blockchain wallet</h2>
          <p className="hint">Your MetaMask wallet, linked to {customer?.fullName ?? "your account"}.</p>
        </div>
        {linked === undefined ? null : linked ? (
          <span className="badge badge-ok">
            <Icon name="link" size={13} /> Linked
          </span>
        ) : (
          <span className="badge badge-neutral">Not linked</span>
        )}
      </div>

      {chain.error && <Alert>{chain.error}</Alert>}

      {metaMask.status === "unavailable" ? (
        <>
          <Alert kind="warn">MetaMask was not found in this browser.</Alert>
          <a className="btn btn-primary btn-block" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            Install MetaMask
          </a>
          <p className="hint">After installing it, reload this page.</p>
        </>
      ) : metaMask.status !== "connected" || !current ? (
        <>
          {linked && <LinkedRow address={linked.address} since={linked.linkedAt} />}
          <p className="small muted">
            Connect MetaMask to deposit, withdraw and transfer through the FinNova Bank smart contract. FinNova never sees
            your keys: MetaMask asks you to approve every transaction.
          </p>
          {metaMask.error && <Alert>{metaMask.error}</Alert>}
          <button className="btn btn-primary btn-block" onClick={metaMask.connect} disabled={metaMask.status === "connecting"}>
            {metaMask.status === "connecting" ? (
              <>
                <Spinner /> Waiting for MetaMask…
              </>
            ) : (
              <>
                <Icon name="wallet" size={18} /> Connect MetaMask
              </>
            )}
          </button>
          <div className="demo">
            <strong className="small">Local blockchain</strong>
            <span className="small muted">
              Run <code>bun run chain</code> and add the network to MetaMask: RPC <code>{LOCAL_CHAIN.rpcUrl}</code>, chain ID{" "}
              <code>{LOCAL_CHAIN.chainId.toString()}</code>, symbol <code>ETH</code>.
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
            <span className="account-pill">
              <AddressAvatar address={current} size={22} />
              <span className="mono">{shortAddress(current)}</span>
              <CopyButton value={current} label="your address" />
            </span>
            <span className="row" style={{ gap: 6 }}>
              {metaMask.chainId !== null && <NetworkPill chainId={metaMask.chainId} />}
              <button className="btn btn-ghost btn-sm" onClick={metaMask.disconnect} title="Disconnect MetaMask">
                <Icon name="logout" size={16} /> Disconnect
              </button>
            </span>
          </div>

          {linked === undefined ? (
            <Skeleton height={42} />
          ) : matches ? (
            <div className="row-between" style={{ gap: 8 }}>
              <span className="small muted">Linked to your FinNova account on {formatFullDate(linked!.linkedAt)}.</span>
              <button className="btn btn-ghost btn-sm" onClick={unlink} disabled={busy !== null}>
                {busy === "unlink" ? <Spinner /> : "Unlink"}
              </button>
            </div>
          ) : (
            <>
              {linked ? (
                <Alert kind="warn">
                  Your FinNova account is linked to <code>{shortAddress(linked.address)}</code>, but MetaMask is using{" "}
                  <code>{shortAddress(current)}</code>. Switch accounts in MetaMask, or link this wallet instead.
                </Alert>
              ) : (
                <p className="small muted">
                  Link this wallet to your FinNova account. Other customers can then send you on-chain transfers by your
                  email or phone number, and your dashboard shows your on-chain balance. You only sign a message: it is free
                  and sends no transaction.
                </p>
              )}
              <button className="btn btn-primary btn-block" onClick={link} disabled={busy !== null}>
                {busy === "link" ? (
                  <>
                    <Spinner /> Sign the message in MetaMask…
                  </>
                ) : (
                  <>
                    <Icon name="link" size={18} /> {linked ? "Link this wallet instead" : "Link wallet to FinNova"}
                  </>
                )}
              </button>
            </>
          )}
        </>
      )}

      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function LinkedRow({ address, since }: { address: string; since: string }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <AddressAvatar address={address} size={28} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="mono ellipsis">{address}</div>
        <div className="hint">Linked on {formatFullDate(since)}</div>
      </div>
      <CopyButton value={address} label="linked address" />
    </div>
  );
}
