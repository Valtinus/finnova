import { describeError } from "@finnova/contracts";
import { BrowserProvider, getAddress, type JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { LOCAL_CHAIN } from "../lib/eth";

export type WalletStatus = "unavailable" | "disconnected" | "connecting" | "connected";

export interface Wallet {
  status: WalletStatus;
  account: string | null;
  chainId: bigint | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  switchToLocalChain(): Promise<void>;
}

interface Connection {
  account: string;
  chainId: bigint;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
}

async function open(account: string): Promise<Connection> {
  // "any" lets the provider follow network switches in MetaMask. The read cache is off so balances
  // are re-read right after a transaction is mined (a local chain mines in milliseconds).
  const provider = new BrowserProvider(window.ethereum!, "any", { cacheTimeout: -1 });
  const [network, signer] = await Promise.all([provider.getNetwork(), provider.getSigner(account)]);
  return { account: getAddress(account), chainId: network.chainId, provider, signer };
}

/** The user's MetaMask wallet: connection state, active account and network. */
export function useWallet(): Wallet {
  const injected = typeof window !== "undefined" ? window.ethereum : undefined;
  const [status, setStatus] = useState<WalletStatus>(injected ? "disconnected" : "unavailable");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const use = useCallback(async (accounts: string[]) => {
    if (accounts.length === 0) {
      setConnection(null);
      setStatus("disconnected");
      return;
    }
    setConnection(await open(accounts[0]!));
    setStatus("connected");
  }, []);

  // Reconnect silently if this site is already authorised in MetaMask, then follow its events
  useEffect(() => {
    if (!injected) return;
    void (injected.request({ method: "eth_accounts" }) as Promise<string[]>).then(use).catch(() => undefined);

    const onAccounts = (accounts: string[]) => void use(accounts);
    const onChain = () =>
      void (injected.request({ method: "eth_accounts" }) as Promise<string[]>).then(use).catch(() => undefined);
    injected.on?.("accountsChanged", onAccounts);
    injected.on?.("chainChanged", onChain);
    return () => {
      injected.removeListener?.("accountsChanged", onAccounts);
      injected.removeListener?.("chainChanged", onChain);
    };
  }, [injected, use]);

  const connect = useCallback(async () => {
    if (!injected) return;
    setStatus("connecting");
    setError(null);
    try {
      await use((await injected.request({ method: "eth_requestAccounts" })) as string[]);
    } catch (e) {
      setError(describeError(e));
      setStatus("disconnected");
    }
  }, [injected, use]);

  const disconnect = useCallback(async () => {
    // Revoke the site's permission so the next visit asks again; older MetaMask versions don't
    // support this, in which case the DApp just forgets the account until "Connect" is clicked.
    try {
      await injected?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      /* not supported */
    }
    setConnection(null);
    setStatus("disconnected");
  }, [injected]);

  const switchToLocalChain = useCallback(async () => {
    if (!injected) return;
    const chainId = `0x${LOCAL_CHAIN.chainId.toString(16)}`; // MetaMask rejects leading zeros (0x0539)
    try {
      await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (e) {
      // 4902: MetaMask doesn't know the chain yet, so add it (which also switches to it)
      if ((e as { code?: number }).code !== 4902) throw e;
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: LOCAL_CHAIN.name,
            rpcUrls: [LOCAL_CHAIN.rpcUrl],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    }
  }, [injected]);

  return {
    status,
    account: connection?.account ?? null,
    chainId: connection?.chainId ?? null,
    provider: connection?.provider ?? null,
    signer: connection?.signer ?? null,
    error,
    connect,
    disconnect,
    switchToLocalChain,
  };
}
