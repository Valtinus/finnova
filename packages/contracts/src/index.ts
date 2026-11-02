import artifact from "../artifacts/FinNovaBank.json";

/** ABI and bytecode of FinNovaBank.sol, produced by `bun run compile` (see scripts/compile.ts). */
export const FINNOVA_BANK_ABI = artifact.abi;
export const FINNOVA_BANK_BYTECODE = artifact.bytecode;
export const FINNOVA_BANK_COMPILER = artifact.compiler;

export { describeError, revertReason } from "./errors";
export type { FinNovaBank, FinNovaBankFunctions } from "./types";
