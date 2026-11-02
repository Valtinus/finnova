import { isError } from "ethers";

const REVERT_IN_MESSAGE = /revert(?:ed)?(?: with reason string)?:?\s+'?([^'"\n]+?)'?(?:["\n]|$)/i;

/** Depth-first search for the first value that `pick` accepts, through nested error objects. */
function find<T>(value: unknown, pick: (v: Record<string, unknown>) => T | undefined, depth = 0): T | undefined {
  if (!value || typeof value !== "object" || depth > 6) return undefined;
  const obj = value as Record<string, unknown>;
  const hit = pick(obj);
  if (hit !== undefined) return hit;
  for (const key of ["revert", "info", "error", "data", "originalError", "cause"]) {
    const nested = find(obj[key], pick, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/**
 * The require() message of a reverted transaction, or null if there is none.
 *
 * ethers only decodes it when the node returns plain revert data. Ganache nests it as
 * `{ data: { reason } }`, and MetaMask wraps node errors as "Internal JSON-RPC error" with the
 * original under `data.originalError`, so this looks through all of those shapes.
 */
export function revertReason(error: unknown): string | null {
  const direct = find(error, (o) => {
    if (typeof o.reason === "string" && o.reason) return o.reason;
    if (o.name === "Error" && Array.isArray(o.args) && typeof o.args[0] === "string") return o.args[0];
    return undefined;
  });
  if (direct) return direct;

  const fromMessage = find(error, (o) =>
    typeof o.message === "string" ? REVERT_IN_MESSAGE.exec(o.message)?.[1]?.trim() : undefined,
  );
  return fromMessage ?? null;
}

/** A short, human-readable message for any error thrown while talking to the wallet or the contract. */
export function describeError(error: unknown): string {
  if (isError(error, "ACTION_REJECTED")) return "You rejected the request in MetaMask.";
  const reason = revertReason(error);
  if (reason) return reason;
  if (isError(error, "INSUFFICIENT_FUNDS")) return "Your wallet does not have enough ETH for this amount plus gas.";
  const short = find(error, (o) => (typeof o.shortMessage === "string" ? o.shortMessage : undefined));
  if (short) return short;
  return error instanceof Error ? error.message : String(error);
}
