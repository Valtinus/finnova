import { Icon } from "../components/Icon";
import { useToast } from "../hooks/useToast";
import { chainName } from "./eth";

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
      type="button"
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

export function NetworkPill({ chainId }: { chainId: bigint }) {
  return (
    <span className="network-pill" title={`Chain ID ${chainId}`}>
      <i /> {chainName(chainId)}
    </span>
  );
}
