import { describeError } from "@finnova/contracts";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "../lib/api";
import type { ChainAccount } from "../lib/types";
import type { MetaMask } from "./useMetaMask";

/** Message for anything thrown while linking: API errors as the API words them, wallet errors via describeError. */
export const chainErrorMessage = (err: unknown) => (err instanceof ApiError ? errorMessage(err) : describeError(err));

export interface ChainLink {
  /** the wallet linked to the signed-in FinNova customer; undefined while loading */
  account: ChainAccount | null | undefined;
  error: string | null;
  /** Prove ownership of MetaMask's current account by signing the API's challenge, then link it. */
  link(metaMask: MetaMask): Promise<ChainAccount>;
  unlink(): Promise<void>;
}

/** The blockchain wallet linked to the FinNova account (stored by the API, not on chain). */
export function useChainAccount(): ChainLink {
  const [account, setAccount] = useState<ChainAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.blockchain
      .account()
      .then((r) => !cancelled && (setAccount(r.account), setError(null)))
      .catch((e) => !cancelled && (setAccount(null), setError(errorMessage(e))));
    return () => {
      cancelled = true;
    };
  }, []);

  const link = useCallback(async (metaMask: MetaMask) => {
    if (!metaMask.account || !metaMask.signer) throw new Error("Connect MetaMask first.");
    const challenge = await api.blockchain.challenge(metaMask.account);
    // personal_sign: MetaMask shows the text; signing is free and sends no transaction
    const signature = await metaMask.signer.signMessage(challenge.message);
    const linked = await api.blockchain.link({ address: challenge.address, issuedAt: challenge.issuedAt, signature });
    setAccount(linked);
    setError(null);
    return linked;
  }, []);

  const unlink = useCallback(async () => {
    await api.blockchain.unlink();
    setAccount(null);
  }, []);

  return { account, error, link, unlink };
}
