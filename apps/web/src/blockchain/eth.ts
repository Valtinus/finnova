import { formatEther, JsonRpcProvider, parseEther, type Eip1193Provider } from "ethers";

/** MetaMask's injected provider (EIP-1193 plus its event API). */
export interface InjectedProvider extends Eip1193Provider {
  isMetaMask?: boolean;
  on?(event: string, listener: (...args: never[]) => void): void;
  removeListener?(event: string, listener: (...args: never[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

/** The local chain `bun run chain` starts (same chain id as the Ganache desktop app). */
export const LOCAL_CHAIN = {
  chainId: 1337n,
  name: "Localhost 8545",
  rpcUrl: (import.meta.env.VITE_RPC_URL as string | undefined) || "http://127.0.0.1:8545",
};

let readProvider: JsonRpcProvider | null = null;

/**
 * A read-only connection straight to the local chain, for showing a linked wallet's balance
 * without MetaMask (e.g. on the dashboard). staticNetwork stops ethers from retrying forever
 * when the chain is not running; calls then simply fail.
 */
export function readOnlyProvider(): JsonRpcProvider {
  readProvider ??= new JsonRpcProvider(LOCAL_CHAIN.rpcUrl, Number(LOCAL_CHAIN.chainId), {
    staticNetwork: true,
    cacheTimeout: -1,
  });
  return readProvider;
}

const CHAIN_NAMES: Record<string, string> = {
  "1": "Ethereum Mainnet",
  "1337": "Localhost (Ganache)",
  "5777": "Ganache",
  "31337": "Hardhat",
  "11155111": "Sepolia testnet",
};

export const chainName = (chainId: bigint) => CHAIN_NAMES[chainId.toString()] ?? `Chain ${chainId}`;

/** "0x90F8…c9C1" */
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** Wei as ETH for display, with at most `decimals` fraction digits: 1.5 ETH, 0.0001 ETH. */
export function formatEth(wei: bigint, decimals = 4): string {
  const [whole, fraction = ""] = formatEther(wei).split(".");
  const trimmed = fraction.slice(0, decimals).replace(/0+$/, "");
  const grouped = BigInt(whole!).toLocaleString("en-US");
  // Never show a non-zero amount as plain "0"
  if (!trimmed && whole === "0" && wei > 0n) return `<0.${"0".repeat(decimals - 1)}1 ETH`;
  return `${grouped}${trimmed ? `.${trimmed}` : ""} ETH`;
}

/** Parse an ETH amount typed by the user into wei; null when it is not a positive number. */
export function parseEthInput(text: string): bigint | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d*\.?\d{0,18}$/.test(normalized) || normalized === "" || normalized === ".") return null;
  try {
    const wei = parseEther(normalized);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}
