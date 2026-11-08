import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ChainParty } from "../lib/types";

/** Addresses already resolved to a FinNova customer, shared across pages for the session. */
const known = new Map<string, ChainParty>();

/**
 * FinNova customers behind blockchain addresses (keyed by lowercase address), so the history can
 * say "To Bob Nagy" instead of "To 0xFFcf…09f0". Addresses nobody linked simply stay unnamed.
 */
export function useChainNames(addresses: string[]): Map<string, ChainParty> {
  const key = [...new Set(addresses.map((a) => a.toLowerCase()))].sort().join(",");
  const [names, setNames] = useState(() => new Map(known));

  useEffect(() => {
    const missing = key.split(",").filter((a) => a && !known.has(a));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.allSettled(missing.map((a) => api.blockchain.lookup(a))).then((results) => {
      for (const r of results) if (r.status === "fulfilled") known.set(r.value.address.toLowerCase(), r.value);
      if (!cancelled) setNames(new Map(known));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
