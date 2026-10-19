import { and, desc, eq, lt } from "drizzle-orm";
import type { DB } from "../db/client";
import { ledgerEntries, wallets, type Wallet } from "../db/schema";
import { notFound } from "../lib/errors";
import { formatCents } from "../lib/format";
import { newId, nowIso } from "../lib/ids";
import type { Tx } from "./ledger";

export function toWalletDto(w: Wallet) {
  return {
    id: w.id,
    customerId: w.customerId,
    currency: "EUR" as const,
    balanceCents: w.balanceCents,
    balanceFormatted: formatCents(w.balanceCents),
    status: w.status,
    nickname: w.nickname,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export function createWallet(db: DB | Tx, customerId: string, nickname: string | null = "Main wallet") {
  return db.insert(wallets).values({ id: newId("wal"), customerId, nickname }).returning().get();
}

export function findWalletByCustomer(db: DB, customerId: string) {
  return db.select().from(wallets).where(eq(wallets.customerId, customerId)).get() ?? null;
}

export function getWalletByCustomer(db: DB, customerId: string) {
  const wallet = findWalletByCustomer(db, customerId);
  if (!wallet) throw notFound("Wallet");
  return wallet;
}

export function updateWallet(
  db: DB,
  customerId: string,
  patch: { nickname?: string | null; status?: Wallet["status"] },
) {
  const wallet = getWalletByCustomer(db, customerId);
  return db
    .update(wallets)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(wallets.id, wallet.id))
    .returning()
    .get()!;
}

/** Ledger lines for a wallet (bank-statement style), newest first. */
export function listLedger(db: DB, walletId: string, limit: number, before?: string) {
  return db
    .select({
      id: ledgerEntries.id,
      transactionId: ledgerEntries.transactionId,
      direction: ledgerEntries.direction,
      amountCents: ledgerEntries.amountCents,
      balanceAfterCents: ledgerEntries.balanceAfterCents,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.walletId, walletId), before ? lt(ledgerEntries.id, before) : undefined))
    .orderBy(desc(ledgerEntries.id))
    .limit(limit)
    .all();
}
