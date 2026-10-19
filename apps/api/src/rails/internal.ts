import type { PaymentRail, RailInitiateInput, RailResult, TransactionStatus } from "@finnova/shared";
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { transactions } from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { nowIso } from "../lib/ids";
import { creditWallet, debitWallet, type Tx } from "../services/ledger";

export interface SettleResult extends RailResult {
  /** The domain error that caused a FAILED settlement (e.g. INSUFFICIENT_FUNDS). */
  error?: AppError;
}

/**
 * INTERNAL rail: moves money between two FinNova wallets on our own ledger.
 * Settlement is instant and atomic (debit + credit + status in one SQLite transaction).
 */
export class InternalLedgerRail implements PaymentRail {
  readonly id = "INTERNAL" as const;

  constructor(private readonly db: DB) {}

  async initiate(input: RailInitiateInput): Promise<RailResult> {
    return this.settle(input.transactionId);
  }

  /**
   * Settle a PENDING internal transaction.
   * `inTransaction` lets callers add extra writes that must commit together
   * with the money movement (e.g. marking a QR request as PAID).
   */
  settle(transactionId: string, inTransaction?: (tx: Tx) => void): SettleResult {
    try {
      this.db.transaction((tx) => {
        const txn = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
        if (!txn) throw notFound("Transaction");
        if (txn.status !== "PENDING") return; // already settled -> idempotent no-op
        if (!txn.fromWalletId || !txn.toWalletId) {
          throw new AppError(500, "INTERNAL_ERROR", "Internal transfer needs both wallets");
        }

        debitWallet(tx, txn.fromWalletId, txn.amountCents, txn.id);
        creditWallet(tx, txn.toWalletId, txn.amountCents, txn.id);
        inTransaction?.(tx);

        tx.update(transactions)
          .set({ status: "COMPLETED", completedAt: nowIso() })
          .where(eq(transactions.id, txn.id))
          .run();
      });
      return { status: "COMPLETED" };
    } catch (err) {
      if (err instanceof AppError && err.status < 500) {
        // Business failure: everything rolled back, record the failed attempt for history.
        this.db
          .update(transactions)
          .set({ status: "FAILED", failureReason: err.code, completedAt: nowIso() })
          .where(and(eq(transactions.id, transactionId), eq(transactions.status, "PENDING")))
          .run();
        return { status: "FAILED", failureReason: err.code, error: err };
      }
      throw err;
    }
  }

  async confirm(transactionId: string): Promise<RailResult> {
    return this.settle(transactionId);
  }

  async fail(transactionId: string, reason: string): Promise<RailResult> {
    this.db
      .update(transactions)
      .set({ status: "FAILED", failureReason: reason, completedAt: nowIso() })
      .where(and(eq(transactions.id, transactionId), eq(transactions.status, "PENDING")))
      .run();
    return { status: "FAILED", failureReason: reason };
  }

  async getStatus(transactionId: string): Promise<TransactionStatus> {
    const txn = this.db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    if (!txn) throw notFound("Transaction");
    return txn.status;
  }
}
