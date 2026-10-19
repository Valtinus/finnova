import type { PaymentRailId, TransactionStatus } from "./domain";

/**
 * A PaymentRail moves money over one specific network.
 *
 * Today:   INTERNAL (ledger) and CARD (mock gateway).
 * Later:   CRYPTO (e.g. a stablecoin on a testnet) — implement this
 *          interface and register it; the transaction model already
 *          carries a `rail` column so nothing else needs to change.
 */
export interface PaymentRail {
  readonly id: PaymentRailId;

  /** Start a payment. Synchronous rails may complete immediately. */
  initiate(input: RailInitiateInput): Promise<RailResult>;

  /** Called when the external network confirms (webhook, on-chain confirmation, ...). */
  confirm(transactionId: string, externalRef: string): Promise<RailResult>;

  /** Called when the external network reports a failure. */
  fail(transactionId: string, reason: string): Promise<RailResult>;

  /** Current status of a payment on this rail. */
  getStatus(transactionId: string): Promise<TransactionStatus>;
}

export interface RailInitiateInput {
  transactionId: string;
  amountCents: number;
  currency: string;
  fromWalletId: string | null;
  toWalletId: string | null;
  description?: string | null;
}

export interface RailResult {
  status: TransactionStatus;
  /** Reference on the external network (gateway session id, tx hash, ...). */
  externalRef?: string | null;
  /** Where the customer must go to finish (e.g. gateway checkout page). */
  redirectUrl?: string | null;
  failureReason?: string | null;
}
