import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  PAYMENT_RAILS,
  QR_REQUEST_STATUSES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  WALLET_STATUSES,
} from "@finnova/shared";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

/** A bank customer (also the login identity). */
export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

/** One EUR wallet per customer. Balance is a cached projection of ledger_entries. */
export const wallets = sqliteTable(
  "wallets",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    currency: text("currency").notNull().default("EUR"),
    balanceCents: integer("balance_cents").notNull().default(0),
    status: text("status", { enum: WALLET_STATUSES }).notNull().default("ACTIVE"),
    nickname: text("nickname"),
    ...timestamps,
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    uniqueIndex("wallets_customer_currency_uq").on(t.customerId, t.currency),
    check("wallets_balance_non_negative", sql`${t.balanceCents} >= 0`),
  ],
);

/**
 * A business-level payment (top-up, P2P transfer, QR payment).
 * Money movement itself is recorded in ledger_entries (double entry).
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    status: text("status", { enum: TRANSACTION_STATUSES }).notNull(),
    rail: text("rail", { enum: PAYMENT_RAILS }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    /** null for top-ups (money comes from outside) */
    fromWalletId: text("from_wallet_id").references(() => wallets.id),
    /** null would mean a payout (not implemented yet) */
    toWalletId: text("to_wallet_id").references(() => wallets.id),
    /** customer who triggered the transaction */
    initiatedBy: text("initiated_by")
      .notNull()
      .references(() => customers.id),
    description: text("description"),
    /** human-friendly reference shown on receipts, e.g. FN-7K2P9Q */
    reference: text("reference").notNull().unique(),
    /** id on the external rail (gateway session, tx hash...) */
    externalRef: text("external_ref"),
    idempotencyKey: text("idempotency_key"),
    qrRequestId: text("qr_request_id"),
    failureReason: text("failure_reason"),
    ...timestamps,
    completedAt: text("completed_at"),
  },
  (t) => [
    uniqueIndex("transactions_idempotency_uq").on(t.initiatedBy, t.idempotencyKey),
    index("transactions_from_idx").on(t.fromWalletId, t.createdAt),
    index("transactions_to_idx").on(t.toWalletId, t.createdAt),
    check("transactions_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

/** Double-entry ledger: every completed transaction produces balanced lines. */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    /** null = external world (gateway clearing account) */
    walletId: text("wallet_id").references(() => wallets.id),
    account: text("account").notNull(), // "wallet" | "gateway_clearing"
    direction: text("direction", { enum: ["DEBIT", "CREDIT"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents"),
    ...timestamps,
  },
  (t) => [index("ledger_wallet_idx").on(t.walletId, t.createdAt)],
);

/** QR payment request created by the payee; paid by scanning. */
export const qrRequests = sqliteTable("qr_requests", {
  id: text("id").primaryKey(),
  payeeWalletId: text("payee_wallet_id")
    .notNull()
    .references(() => wallets.id),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  description: text("description"),
  status: text("status", { enum: QR_REQUEST_STATUSES }).notNull().default("OPEN"),
  expiresAt: text("expires_at").notNull(),
  paidByTransactionId: text("paid_by_transaction_id"),
  ...timestamps,
});

/** Sessions on the (mock) card payment gateway. */
export const gatewaySessions = sqliteTable("gateway_sessions", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  status: text("status", { enum: ["OPEN", "SUCCEEDED", "DECLINED", "EXPIRED"] })
    .notNull()
    .default("OPEN"),
  cardLast4: text("card_last4"),
  declineReason: text("decline_reason"),
  /** where the hosted checkout sends the customer afterwards (frontend URL) */
  returnUrl: text("return_url"),
  ...timestamps,
});

export type Customer = typeof customers.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type QrRequest = typeof qrRequests.$inferSelect;
export type GatewaySession = typeof gatewaySessions.$inferSelect;
