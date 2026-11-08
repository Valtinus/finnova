import { describeError, FINNOVA_BANK_ABI, type FinNovaBank } from "@finnova/contracts";
import { Contract, EventLog, type ContractTransactionResponse } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Wallet } from "./useWallet";

export type HistoryKind = "deposit" | "withdrawal" | "sent" | "received";

/** One completed operation, read back from the contract's events. */
export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  amount: bigint;
  counterparty: string | null;
  /** Account balance right after a deposit or withdrawal (transfers don't record it). */
  balanceAfter: bigint | null;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

/** Whether the configured address holds the FinNova Bank contract on the current network. */
export type ContractState = "no-address" | "checking" | "missing" | "ready";

export interface Bank {
  contractState: ContractState;
  balance: bigint | null;
  walletBalance: bigint | null;
  totalDeposits: bigint | null;
  history: HistoryItem[] | null;
  error: string | null;
  refresh(): Promise<void>;
  deposit(amount: bigint): Promise<ContractTransactionResponse>;
  withdraw(amount: bigint): Promise<ContractTransactionResponse>;
  transfer(to: string, amount: bigint): Promise<ContractTransactionResponse>;
}

function toItem(log: EventLog, account: string): HistoryItem {
  const { args } = log;
  const base = {
    id: `${log.transactionHash}-${log.index}`,
    amount: args.amount as bigint,
    timestamp: Number(args.timestamp) * 1000,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
  };
  if (log.eventName === "Deposited") return { ...base, kind: "deposit", counterparty: null, balanceAfter: args.newBalance };
  if (log.eventName === "Withdrawn") return { ...base, kind: "withdrawal", counterparty: null, balanceAfter: args.newBalance };
  const sent = (args.from as string).toLowerCase() === account.toLowerCase();
  return { ...base, kind: sent ? "sent" : "received", counterparty: sent ? args.to : args.from, balanceAfter: null };
}

/**
 * The connected account at the FinNova Bank contract: balances, history and the three operations.
 * Everything is re-read whenever a new block arrives, so transfers from other accounts show up too.
 */
export function useBank(wallet: Wallet, contractAddress: string | null): Bank {
  const { provider, signer, account, chainId } = wallet;
  const [contractState, setContractState] = useState<ContractState>("no-address");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [totalDeposits, setTotalDeposits] = useState<bigint | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const contract = useMemo(
    () => (contractAddress && signer ? (new Contract(contractAddress, FINNOVA_BANK_ABI, signer) as FinNovaBank) : null),
    [contractAddress, signer],
  );

  // Start from a clean slate whenever the account, network or contract changes
  useEffect(() => {
    setBalance(null);
    setWalletBalance(null);
    setTotalDeposits(null);
    setHistory(null);
    setError(null);
    if (!contractAddress) return setContractState("no-address");
    if (!provider) return;
    setContractState("checking");
    let cancelled = false;
    provider
      .getCode(contractAddress)
      .then((code) => !cancelled && setContractState(code === "0x" ? "missing" : "ready"))
      .catch((e) => !cancelled && (setContractState("missing"), setError(describeError(e))));
    return () => {
      cancelled = true;
    };
  }, [provider, contractAddress, chainId, account]);

  const refresh = useCallback(async () => {
    if (!contract || !provider || !account || contractState !== "ready") return;
    const run = ++generation.current;
    try {
      const { Deposited, Withdrawn, Transferred } = contract.filters;
      const [mine, wallet, total, ...logs] = await Promise.all([
        contract.checkBalance(),
        provider.getBalance(account),
        contract.totalDeposits(),
        contract.queryFilter(Deposited!(account)),
        contract.queryFilter(Withdrawn!(account)),
        contract.queryFilter(Transferred!(account)),
        contract.queryFilter(Transferred!(null, account)),
      ]);
      if (run !== generation.current) return; // a newer refresh already started
      setBalance(mine);
      setWalletBalance(wallet);
      setTotalDeposits(total);
      setHistory(
        logs
          .flat()
          .filter((log): log is EventLog => log instanceof EventLog)
          .sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index) // newest first
          .map((log) => toItem(log, account)),
      );
      setError(null);
    } catch (e) {
      if (run === generation.current) setError(describeError(e));
    }
  }, [contract, provider, account, contractState]);

  useEffect(() => {
    if (!provider || contractState !== "ready") return;
    void refresh();
    const onBlock = () => void refresh();
    void provider.on("block", onBlock);
    return () => void provider.off("block", onBlock);
  }, [provider, contractState, refresh]);

  const need = useCallback(() => {
    if (!contract) throw new Error("Connect your wallet and set the contract address first.");
    return contract;
  }, [contract]);

  return {
    contractState,
    balance,
    walletBalance,
    totalDeposits,
    history,
    error,
    refresh,
    deposit: useCallback((amount) => need().deposit({ value: amount }), [need]),
    withdraw: useCallback((amount) => need().withdraw(amount), [need]),
    transfer: useCallback((to, amount) => need().transfer(to, amount), [need]),
  };
}
