import { isAddress, getAddress } from "ethers";
import { useCallback, useState } from "react";

const STORAGE_KEY = "finnova.dapp.contract";
const FROM_ENV = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined;

function initial(): string | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  const candidate = saved || FROM_ENV || "";
  return isAddress(candidate) ? getAddress(candidate) : null;
}

/**
 * Address of the FinNova Bank contract: VITE_CONTRACT_ADDRESS in apps/web/.env.local (written by
 * `bun run contracts:deploy`), unless the user pasted another one, e.g. a contract deployed from Remix.
 */
export function useContractAddress() {
  const [address, setAddress] = useState<string | null>(initial);

  const save = useCallback((next: string | null) => {
    const value = next && isAddress(next) ? getAddress(next) : null;
    try {
      if (value && value !== FROM_ENV) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* the choice just won't persist */
    }
    setAddress(value ?? (FROM_ENV && isAddress(FROM_ENV) ? getAddress(FROM_ENV) : null));
  }, []);

  return { address, save, fromEnv: FROM_ENV && isAddress(FROM_ENV) ? getAddress(FROM_ENV) : null };
}
