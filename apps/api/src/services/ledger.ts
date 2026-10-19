import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { ledgerEntries, wallets } from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/ids";

/**
 * Low-level double-entry bookkeeping.
 *
 * bun:sqlite transactions are synchronous, so everything here uses
 * .run() / .get() / .all() and must be called inside db.transaction(...).
 * Throwing inside the transaction rolls back every write.
 */

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Take money out of a wallet. Fails atomically if balance is too low or wallet is frozen. */
export function debitWallet(tx: Tx, walletId: string, amountCents: number, transactionId: string) {
  const wallet = tx.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) throw notFound("Wallet");
  if (wallet.status !== "ACTIVE") throw new AppError(422, "WALLET_FROZEN", "Source wallet is frozen");

  // Conditional update = the balance check and the debit happen in one statement.
  const updated = tx
    .update(wallets)
    .set({ balanceCents: sql`${wallets.balanceCents} - ${amountCents}`, updatedAt: nowIso() })
    .where(and(eq(wallets.id, walletId), gte(wallets.balanceCents, amountCents)))
    .returning({ balanceCents: wallets.balanceCents })
    .get();

  if (!updated) {
    throw new AppError(422, "INSUFFICIENT_FUNDS", "Wallet balance is too low for this payment", {
      balanceCents: wallet.balanceCents,
      requiredCents: amountCents,
    });
  }

  tx.insert(ledgerEntries)
    .values({
      id: newId("led"),
      transactionId,
      walletId,
      account: "wallet",
      direction: "DEBIT",
      amountCents,
      balanceAfterCents: updated.balanceCents,
    })
    .run();

  return updated.balanceCents;
}

/** Put money into a wallet. */
export function creditWallet(tx: Tx, walletId: string, amountCents: number, transactionId: string) {
  const wallet = tx.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) throw notFound("Wallet");
  if (wallet.status !== "ACTIVE") throw new AppError(422, "WALLET_FROZEN", "Recipient wallet is frozen");

  const updated = tx
    .update(wallets)
    .set({ balanceCents: sql`${wallets.balanceCents} + ${amountCents}`, updatedAt: nowIso() })
    .where(eq(wallets.id, walletId))
    .returning({ balanceCents: wallets.balanceCents })
    .get()!;

  tx.insert(ledgerEntries)
    .values({
      id: newId("led"),
      transactionId,
      walletId,
      account: "wallet",
      direction: "CREDIT",
      amountCents,
      balanceAfterCents: updated.balanceCents,
    })
    .run();

  return updated.balanceCents;
}

/** Counter-entry for money arriving from / leaving to the outside world (card gateway). */
export function postExternal(
  tx: Tx,
  account: "gateway_clearing" | "crypto_clearing",
  direction: "DEBIT" | "CREDIT",
  amountCents: number,
  transactionId: string,
) {
  tx.insert(ledgerEntries)
    .values({ id: newId("led"), transactionId, walletId: null, account, direction, amountCents })
    .run();
}
