import type { PaymentRail, RailInitiateInput, RailResult, TransactionStatus } from "@finnova/shared";
import { and, eq } from "drizzle-orm";
import type { AppConfig } from "../config";
import type { DB } from "../db/client";
import { transactions } from "../db/schema";
import type { MockGateway } from "../gateway/mock-gateway";
import { AppError, notFound } from "../lib/errors";
import { nowIso } from "../lib/ids";
import { creditWallet, postExternal } from "../services/ledger";

/**
 * CARD rail: money enters FinNova from a card via the external payment gateway.
 *
 * initiate() -> creates a hosted checkout session, transaction stays PENDING
 * confirm()  -> called from the gateway webhook, credits the wallet
 * fail()     -> called from the gateway webhook on decline
 */
export class CardGatewayRail implements PaymentRail {
  readonly id = "CARD" as const;

  constructor(
    private readonly db: DB,
    private readonly gateway: MockGateway,
    private readonly config: AppConfig,
  ) {}

  async initiate(input: RailInitiateInput & { returnUrl?: string | null }): Promise<RailResult> {
    const session = this.gateway.createSession({
      transactionId: input.transactionId,
      amountCents: input.amountCents,
      currency: input.currency,
      returnUrl: input.returnUrl ?? null,
    });

    this.db
      .update(transactions)
      .set({ externalRef: session.id })
      .where(eq(transactions.id, input.transactionId))
      .run();

    return {
      status: "PENDING",
      externalRef: session.id,
      redirectUrl: `${this.config.publicUrl}/gateway/checkout/${session.id}`,
    };
  }

  async confirm(transactionId: string, externalRef: string): Promise<RailResult> {
    try {
      this.db.transaction((tx) => {
        const txn = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
        if (!txn) throw notFound("Transaction");
        if (txn.status !== "PENDING") return; // duplicate webhook -> no-op
        if (!txn.toWalletId) throw new AppError(500, "INTERNAL_ERROR", "Top-up without wallet");

        postExternal(tx, "gateway_clearing", "DEBIT", txn.amountCents, txn.id);
        creditWallet(tx, txn.toWalletId, txn.amountCents, txn.id);

        tx.update(transactions)
          .set({ status: "COMPLETED", externalRef, completedAt: nowIso() })
          .where(eq(transactions.id, txn.id))
          .run();
      });
    } catch (err) {
      if (err instanceof AppError && err.code === "WALLET_FROZEN") {
        // In a real system this would trigger a refund on the gateway.
        return this.fail(transactionId, "WALLET_FROZEN_REFUNDED");
      }
      throw err;
    }
    return { status: await this.getStatus(transactionId), externalRef };
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
