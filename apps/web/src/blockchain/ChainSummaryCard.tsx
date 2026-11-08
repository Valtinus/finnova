import { FINNOVA_BANK_ABI, type FinNovaBank } from "@finnova/contracts";
import { Contract } from "ethers";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Skeleton } from "../components/ui";
import { AddressAvatar } from "./AddressBits";
import "./blockchain.css";
import { formatEth, readOnlyProvider, shortAddress } from "./eth";
import { useChainAccount } from "./useChainAccount";
import { useContractAddress } from "./useContractAddress";

const REFRESH_MS = 10_000;

/**
 * Dashboard card for the linked blockchain wallet: its FinNova Bank balance read straight from
 * the contract (no MetaMask needed), next to the EUR wallet. Loaded lazily with ethers.
 */
export default function ChainSummaryCard() {
  const { account } = useChainAccount();
  const { address: contractAddress } = useContractAddress();
  const [balance, setBalance] = useState<bigint | "unreachable" | null>(null);
  const linked = account?.address ?? null;

  useEffect(() => {
    setBalance(null);
    if (!linked || !contractAddress) return;
    const contract = new Contract(contractAddress, FINNOVA_BANK_ABI, readOnlyProvider()) as FinNovaBank;
    let cancelled = false;
    const load = () =>
      contract.balanceOf(linked).then(
        (wei) => !cancelled && setBalance(wei),
        () => !cancelled && setBalance("unreachable"), // chain not running, or no contract at the address
      );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [linked, contractAddress]);

  return (
    <div className="card stack chain-summary">
      <div className="row-between">
        <h2>
          <Icon name="box" size={18} /> Blockchain account
        </h2>
        <Link to="/blockchain" className="small">
          Open
        </Link>
      </div>

      {account === undefined ? (
        <Skeleton height={40} />
      ) : account === null ? (
        <>
          <p className="small muted">
            Link your MetaMask wallet to see your on-chain FinNova Bank balance here, and to receive transfers by email.
          </p>
          <Link to="/blockchain" className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }}>
            <Icon name="link" size={15} /> Link a wallet
          </Link>
        </>
      ) : (
        <div className="row" style={{ gap: 12 }}>
          <AddressAvatar address={account.address} size={36} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="mono">{shortAddress(account.address)}</div>
            <div className="hint">Linked wallet · smart contract balance</div>
          </div>
          <div className="chain-summary-balance">
            {!contractAddress ? (
              <span className="hint">No contract set</span>
            ) : balance === null ? (
              <Skeleton height={22} width={90} />
            ) : balance === "unreachable" ? (
              <span className="hint" title="Start the chain (bun run chain) and deploy the contract">
                Chain offline
              </span>
            ) : (
              <strong className="num">{formatEth(balance)}</strong>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
