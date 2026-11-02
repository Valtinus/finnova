import type { Wallet } from "../hooks/useWallet";
import { chainName, shortAddress } from "../lib/eth";
import { Icon, ThemeToggle, useToast } from "../ui";

/** Deterministic two-colour gradient per address, so accounts are easy to tell apart. */
export function AddressAvatar({ address, size = 34 }: { address: string; size?: number }) {
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  const hue2 = (hue + 70) % 360;
  return (
    <span
      className="addr-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 75% 58%), hsl(${hue2} 70% 45%))` }}
    />
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-ghost btn-icon"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() =>
        navigator.clipboard.writeText(value).then(
          () => toast.success(`Copied ${label}`),
          () => toast.error("Could not copy to the clipboard"),
        )
      }
    >
      <Icon name="copy" size={16} />
    </button>
  );
}

export function Topbar({ wallet }: { wallet: Wallet }) {
  return (
    <header className="topbar">
      <div className="logo">
        <div className="logo-mark">F</div>
        <span className="hide-sm">FinNova</span> <span className="dapp-tag">DApp</span>
      </div>
      <div className="row topbar-right">
        {wallet.chainId !== null && (
          <span className="network-pill" title={`Chain ID ${wallet.chainId}`}>
            <i /> {chainName(wallet.chainId)}
          </span>
        )}
        {wallet.account && (
          <span className="account-pill">
            <AddressAvatar address={wallet.account} size={22} />
            <span className="mono">{shortAddress(wallet.account)}</span>
            <CopyButton value={wallet.account} label="your address" />
          </span>
        )}
        <ThemeToggle />
        <button className="btn btn-ghost" onClick={wallet.disconnect} aria-label="Disconnect wallet" title="Disconnect wallet">
          <Icon name="logout" size={18} />
        </button>
      </div>
    </header>
  );
}
