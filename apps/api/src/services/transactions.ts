import type { TransactionStatus, TransactionType } from "@finnova/shared";
import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { DB } from "../db/client";
import { customers, transactions, wallets, type Transaction } from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { maskEmail, signedFormat } from "../lib/format";
import { newId, newReference } from "../lib/ids";

const fromWallet = alias(wallets, "from_wallet");
const toWallet = alias(wallets, "to_wallet");
const fromCustomer = alias(customers, "from_customer");
const toCustomer = alias(customers, "to_customer");

type Party = { id: string; name: string; email: string } | null;
type Row = { t: Transaction; from: Party; to: Party };

function baseQuery(db: DB) {
  return db
    .select({
      t: transactions,
      from: { id: fromCustomer.id, name: fromCustomer.fullName, email: fromCustomer.email },
      to: { id: toCustomer.id, name: toCustomer.fullName, email: toCustomer.email },
    })
    .from(transactions)
    .leftJoin(fromWallet, eq(transactions.fromWalletId, fromWallet.id))
    .leftJoin(fromCustomer, eq(fromWallet.customerId, fromCustomer.id))
    .leftJoin(toWallet, eq(transactions.toWalletId, toWallet.id))
    .leftJoin(toCustomer, eq(toWallet.customerId, toCustomer.id));
}

/** Rows a wallet owner may see: everything they sent, and incoming money that actually arrived. */
function visibleTo(walletId: string, customerId: string): SQL {
  return or(
    eq(transactions.fromWalletId, walletId),
    and(
      eq(transactions.toWalletId, walletId),
      or(eq(transactions.status, "COMPLETED"), eq(transactions.initiatedBy, customerId)),
    ),
  )!;
}

/** Shape a transaction from the viewing wallet's perspective. */
export function toTransactionDto(row: Row, viewerWalletId: string) {
  const { t } = row;
  const direction: "IN" | "OUT" = t.fromWalletId === viewerWalletId ? "OUT" : "IN";
  const signed = direction === "OUT" ? -t.amountCents : t.amountCents;

  let counterparty: { customerId: string | null; name: string; email: string | null } | null = null;
  const other = direction === "OUT" ? row.to : row.from;
  if (other) counterparty = { customerId: other.id, name: other.name, email: maskEmail(other.email) };
  else if (t.type === "TOPUP") counterparty = { customerId: null, name: "Card top-up", email: null };

  return {
    id: t.id,
    reference: t.reference,
    type: t.type,
    status: t.status,
    rail: t.rail,
    direction,
    amountCents: t.amountCents,
    signedAmountCents: signed,
    amountFormatted: signedFormat(signed),
    currency: t.currency,
    description: t.description,
    counterparty,
    failureReason: t.failureReason,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
  };
}

export type TransactionDto = ReturnType<typeof toTransactionDto>;

export interface ListFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  direction?: "IN" | "OUT";
  limit: number;
  /** cursor: return transactions older than this id */
  before?: string;
}

export function listTransactions(db: DB, walletId: string, customerId: string, f: ListFilters) {
  const rows = baseQuery(db)
    .where(
      and(
        visibleTo(walletId, customerId),
        f.type ? eq(transactions.type, f.type) : undefined,
        f.status ? eq(transactions.status, f.status) : undefined,
        f.direction === "OUT" ? eq(transactions.fromWalletId, walletId) : undefined,
        f.direction === "IN" ? eq(transactions.toWalletId, walletId) : undefined,
        f.before ? lt(transactions.id, f.before) : undefined, // ids are time-ordered (UUIDv7)
      ),
    )
    .orderBy(desc(transactions.id))
    .limit(f.limit + 1)
    .all();

  const page = rows.slice(0, f.limit);
  return {
    data: page.map((r) => toTransactionDto(r, walletId)),
    nextCursor: rows.length > f.limit ? (page.at(-1)?.t.id ?? null) : null,
  };
}

export function getTransactionForViewer(db: DB, id: string, walletId: string, customerId: string) {
  const row = baseQuery(db)
    .where(and(eq(transactions.id, id), visibleTo(walletId, customerId)))
    .get();
  if (!row) throw notFound("Transaction");
  return toTransactionDto(row, walletId);
}

/* ---------- creation helpers shared by payment services ---------- */

export function insertPendingTransaction(
  db: DB,
  values: Pick<
    Transaction,
    "type" | "rail" | "amountCents" | "fromWalletId" | "toWalletId" | "initiatedBy" | "description"
  > & { idempotencyKey?: string | null; qrRequestId?: string | null },
) {
  return db
    .insert(transactions)
    .values({ id: newId("txn"), reference: newReference(), status: "PENDING", ...values })
    .returning()
    .get();
}

/**
 * Idempotency: if this customer already used the key, return that transaction
 * (when the request matches) instead of creating a second payment.
 */
export function findIdempotent(
  db: DB,
  customerId: string,
  key: string | undefined,
  expect: { type: TransactionType; amountCents: number; toWalletId?: string | null },
) {
  if (!key) return null;
  const existing = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.initiatedBy, customerId), eq(transactions.idempotencyKey, key)))
    .get();
  if (!existing) return null;

  const same =
    existing.type === expect.type &&
    existing.amountCents === expect.amountCents &&
    (expect.toWalletId === undefined || existing.toWalletId === expect.toWalletId);
  if (!same) {
    throw new AppError(409, "CONFLICT", "Idempotency-Key was already used for a different request");
  }
  return existing;
}
