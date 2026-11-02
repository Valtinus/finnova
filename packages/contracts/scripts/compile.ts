import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import solc from "solc";

const ROOT = join(import.meta.dir, "..");
export const SOURCE_PATH = join(ROOT, "contracts", "FinNovaBank.sol");
export const ARTIFACT_PATH = join(ROOT, "artifacts", "FinNovaBank.json");

/**
 * "paris" (pre-PUSH0) bytecode runs on every local chain: Remix VM, Ganache CLI and the Ganache
 * desktop app, which does not support the newer hardforks that recent compilers target by default.
 */
export const EVM_VERSION = "paris";

export interface Artifact {
  contractName: string;
  compiler: string;
  evmVersion: string;
  abi: unknown[];
  bytecode: string;
}

interface SolcOutput {
  errors?: { severity: "error" | "warning" | "info"; formattedMessage: string }[];
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
}

/** Compile FinNovaBank.sol with solc-js (the same compiler Remix uses) and return its ABI + bytecode. */
export function compile(): Artifact {
  const input = {
    language: "Solidity",
    sources: { "FinNovaBank.sol": { content: readFileSync(SOURCE_PATH, "utf8") } },
    settings: {
      evmVersion: EVM_VERSION,
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;

  const problems = output.errors ?? [];
  for (const p of problems.filter((p) => p.severity === "warning")) console.warn(p.formattedMessage);
  const errors = problems.filter((p) => p.severity === "error");
  if (errors.length > 0) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));

  const contract = output.contracts["FinNovaBank.sol"]!["FinNovaBank"]!;
  return {
    contractName: "FinNovaBank",
    compiler: solc.version(),
    evmVersion: EVM_VERSION,
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}

if (import.meta.main) {
  const artifact = compile();
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Compiled FinNovaBank with solc ${artifact.compiler} → artifacts/FinNovaBank.json`);
}
