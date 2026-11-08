import { FINNOVA_BANK_COMPILER } from "@finnova/contracts";
import { isAddress } from "ethers";
import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Alert, Modal } from "../components/ui";
import { CopyButton } from "./AddressBits";
import { chainName, formatEth, shortAddress } from "./eth";
import type { Bank } from "./useBank";

interface Props {
  bank: Bank;
  address: string | null;
  fromEnv: string | null;
  chainId: bigint | null;
  onChange(address: string | null): void;
}

/** Which contract the page talks to, with a dialog to point it at another deployment. */
export function ContractCard({ bank, address, fromEnv, chainId, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="card stack">
        <div className="row-between">
          <h2>Smart contract</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={14} /> Change
          </button>
        </div>
        <dl className="kv">
          <div>
            <dt>FinNovaBank</dt>
            <dd className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
              {address ? (
                <>
                  <span className="mono">{shortAddress(address)}</span>
                  <CopyButton value={address} label="contract address" />
                </>
              ) : (
                "Not set"
              )}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{chainId === null ? "…" : `${chainName(chainId)} · ${chainId}`}</dd>
          </div>
          <div>
            <dt>Total held by the bank</dt>
            <dd>{bank.totalDeposits === null ? "…" : formatEth(bank.totalDeposits)}</dd>
          </div>
          <div>
            <dt>Compiler</dt>
            <dd className="small">solc {FINNOVA_BANK_COMPILER.split("+")[0]}</dd>
          </div>
        </dl>
      </div>

      {/* Outside the card: its backdrop-filter would trap the fixed overlay inside it */}
      {editing && (
        <ContractDialog
          open
          current={address}
          fromEnv={fromEnv}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            onChange(next);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

function ContractDialog({
  open,
  current,
  fromEnv,
  onClose,
  onSave,
}: {
  open: boolean;
  current: string | null;
  fromEnv: string | null;
  onClose(): void;
  onSave(address: string | null): void;
}) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isAddress(value.trim())) return setError("That is not a valid contract address.");
    onSave(value.trim());
  }

  return (
    <Modal open={open} onClose={onClose} title="Contract address">
      <form className="stack" onSubmit={submit}>
        <p className="small muted">
          Paste the address of a deployed FinNovaBank contract, for example the one Remix shows under <em>Deployed Contracts</em>.
        </p>
        <div className="field">
          <label htmlFor="contract">Address</label>
          <input
            id="contract"
            className="input mono"
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {fromEnv && fromEnv !== current && (
            <button type="button" className="btn btn-ghost" onClick={() => onSave(null)}>
              Reset to {shortAddress(fromEnv)}
            </button>
          )}
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
