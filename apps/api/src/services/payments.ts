import { LIMITS } from "@finnova/shared";
import { eq } from "drizzle-orm";
import { transactions, type Transaction } from "../db/schema";
import type { Deps } from "../env";
import { AppError, notFound, type ErrorCode } from "../lib/errors";
import { formatCents } from "../lib/format";
import { findCustomerByIdentifier } from "./customers";
import { findIdempotent, insertPendingTransaction } from "./transactions";
import { findWalletByCustomer, getWalletByCustomer } from "./wallets";

export interface PaymentOutcome {
  transaction: Transaction;
  /** true when an Idempotency-Key matched an earlier request */
  replayed: boolean;
}

const FAILURE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  INSUFFICIENT_FUNDS: "Wallet balance is too low for this payment",
  WALLET_FROZEN: "One of the wallets is frozen",
  QR_ALREADY_PAID: "This QR code has already been paid",
};

/** Turn a FAILED transaction into the API error the client receives (422). */
export function failedPaymentError(txn: Transaction) {
  const code = (txn.failureReason ?? "INTERNAL_ERROR") as ErrorCode;
  return new AppError(422, code, FAILURE_MESSAGES[code] ?? `Payment failed: ${code}`, {
    transactionId: txn.id,
    reference: txn.reference,
    status: txn.status,
  });
}

function assertAmount(amountCents: number, max: number) {
  if (amountCents > max) {
    throw new AppError(422, "LIMIT_EXCEEDED", `Amount exceeds the per-payment limit of ${formatCents(max)}`);
  }
}

/* ---------------- P2P transfer (INTERNAL rail) ---------------- */

export function createTransfer(
  deps: Deps,
  input: {
    customerId: string;
    to: string;
    amountCents: number;
    description?: string | null;
    idempotencyKey?: string;
  },
): PaymentOutcome {
  const { db, rails } = deps;
  assertAmount(input.amountCents, LIMITS.maxTransferCents);

  const from = getWalletByCustomer(db, input.customerId);
  const recipient = findCustomerByIdentifier(db, input.to);
  const to = recipient ? findWalletByCustomer(db, recipient.id) : null;
  if (!recipient || !to) throw notFound("Recipient");
  if (to.id === from.id) throw new AppError(422, "SELF_TRANSFER", "You cannot send money to yourself");

  const existing = findIdempotent(db, input.customerId, input.idempotencyKey, {
    type: "TRANSFER",
    amountCents: input.amountCents,
    toWalletId: to.id,
  });
  if (existing) return { transaction: existing, replayed: true };

  const txn = insertPendingTransaction(db, {
    type: "TRANSFER",
    rail: "INTERNAL",
    amountCents: input.amountCents,
    fromWalletId: from.id,
    toWalletId: to.id,
    initiatedBy: input.customerId,
    description: input.description ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  rails.INTERNAL.settle(txn.id);
  return { transaction: loadTransaction(deps, txn.id), replayed: false };
}

/* ---------------- Top-up (CARD rail via payment gateway) ---------------- */

export async function createTopup(
  deps: Deps,
  input: { customerId: string; amountCents: number; returnUrl?: string | null; idempotencyKey?: string },
) {
  const { db, rails, config } = deps;
  assertAmount(input.amountCents, LIMITS.maxTopupCents);
  const wallet = getWalletByCustomer(db, input.customerId);
  if (wallet.status !== "ACTIVE") throw new AppError(422, "WALLET_FROZEN", "Wallet is frozen");

  const existing = findIdempotent(db, input.customerId, input.idempotencyKey, {
    type: "TOPUP",
    amountCents: input.amountCents,
  });
  if (existing) {
    return {
      transaction: existing,
      replayed: true,
      checkoutUrl: existing.externalRef ? `${config.publicUrl}/gateway/checkout/${existing.externalRef}` : null,
      sessionId: existing.externalRef,
    };
  }

  const txn = insertPendingTransaction(db, {
    type: "TOPUP",
    rail: "CARD",
    amountCents: input.amountCents,
    fromWalletId: null,
    toWalletId: wallet.id,
    initiatedBy: input.customerId,
    description: "Card top-up",
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const result = await rails.CARD.initiate({
    transactionId: txn.id,
    amountCents: txn.amountCents,
    currency: txn.currency,
    fromWalletId: null,
    toWalletId: wallet.id,
    returnUrl: input.returnUrl ?? null,
  });

  return {
    transaction: loadTransaction(deps, txn.id),
    replayed: false,
    checkoutUrl: result.redirectUrl ?? null,
    sessionId: result.externalRef ?? null,
  };
}

export function loadTransaction(deps: Deps, id: string): Transaction {
  const t = deps.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!t) throw notFound("Transaction");
  return t;
}
