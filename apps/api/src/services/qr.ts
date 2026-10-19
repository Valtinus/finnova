import { LIMITS, QR_SCHEME, type QrRequestStatus } from "@finnova/shared";
import { and, desc, eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { DB } from "../db/client";
import { customers, qrRequests, wallets, type QrRequest } from "../db/schema";
import type { Deps } from "../env";
import { AppError, notFound } from "../lib/errors";
import { formatCents, maskEmail } from "../lib/format";
import { newId } from "../lib/ids";
import { loadTransaction, type PaymentOutcome } from "./payments";
import { findIdempotent, insertPendingTransaction } from "./transactions";
import { getWalletByCustomer } from "./wallets";

/**
 * QR payments
 *
 *  1. Payee creates a payment request  -> gets a QR containing
 *        finnova://pay?rid=<requestId>&sig=<hmac>
 *  2. Payer scans it, the app calls /qr/resolve to preview amount + payee
 *  3. Payer confirms -> /qr/pay settles it on the INTERNAL rail and marks
 *     the request PAID in the same database transaction (can't be paid twice).
 *
 *  The signature stops people from forging or guessing request ids.
 */

function sign(secret: string, req: Pick<QrRequest, "id" | "amountCents" | "payeeWalletId">) {
  return createHmac("sha256", secret)
    .update(`${req.id}.${req.amountCents}.${req.payeeWalletId}`)
    .digest("base64url")
    .slice(0, 22);
}

export function buildPayload(secret: string, req: QrRequest) {
  return `${QR_SCHEME}?rid=${req.id}&sig=${sign(secret, req)}`;
}

/** Parse + verify a scanned payload. Accepts the full URI. */
function parsePayload(db: DB, secret: string, payload: string): QrRequest {
  let rid: string | null = null;
  let sig: string | null = null;
  try {
    const url = new URL(payload.trim());
    if (`${url.protocol}//${url.host}${url.pathname}` !== QR_SCHEME) throw new Error();
    rid = url.searchParams.get("rid");
    sig = url.searchParams.get("sig");
  } catch {
    throw new AppError(400, "QR_INVALID", "This is not a FinNova payment QR code");
  }
  if (!rid || !sig) throw new AppError(400, "QR_INVALID", "QR code is missing data");

  const req = db.select().from(qrRequests).where(eq(qrRequests.id, rid)).get();
  if (!req) throw new AppError(400, "QR_INVALID", "QR code is not valid");

  const expected = Buffer.from(sign(secret, req));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new AppError(400, "QR_INVALID", "QR code signature is invalid");
  }
  return refreshExpiry(db, req);
}

/** Lazily flip OPEN requests past their expiry to EXPIRED. */
function refreshExpiry(db: DB, req: QrRequest): QrRequest {
  if (req.status === "OPEN" && Date.parse(req.expiresAt) <= Date.now()) {
    return db
      .update(qrRequests)
      .set({ status: "EXPIRED" })
      .where(eq(qrRequests.id, req.id))
      .returning()
      .get()!;
  }
  return req;
}

export function toQrDto(db: DB, req: QrRequest) {
  const payee = db
    .select({ id: customers.id, name: customers.fullName, email: customers.email })
    .from(wallets)
    .innerJoin(customers, eq(wallets.customerId, customers.id))
    .where(eq(wallets.id, req.payeeWalletId))
    .get()!;
  return {
    id: req.id,
    amountCents: req.amountCents,
    amountFormatted: formatCents(req.amountCents),
    currency: req.currency,
    description: req.description,
    status: req.status,
    payee: { customerId: payee.id, name: payee.name, email: maskEmail(payee.email) },
    expiresAt: req.expiresAt,
    createdAt: req.createdAt,
    paidByTransactionId: req.paidByTransactionId,
  };
}

export async function createQrRequest(
  deps: Deps,
  customerId: string,
  input: { amountCents: number; description?: string | null; expiresInSeconds?: number },
) {
  const { db, config } = deps;
  if (input.amountCents > LIMITS.maxTransferCents) {
    throw new AppError(422, "LIMIT_EXCEEDED", "Amount exceeds the per-payment limit");
  }
  const wallet = getWalletByCustomer(db, customerId);
  if (wallet.status !== "ACTIVE") throw new AppError(422, "WALLET_FROZEN", "Wallet is frozen");

  const ttl = input.expiresInSeconds ?? config.qrDefaultTtlSeconds;
  const req = db
    .insert(qrRequests)
    .values({
      id: newId("qr"),
      payeeWalletId: wallet.id,
      amountCents: input.amountCents,
      description: input.description ?? null,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    })
    .returning()
    .get();

  return withQrImage(deps, req);
}

export async function withQrImage(deps: Deps, req: QrRequest) {
  const payload = buildPayload(deps.config.qrSigningSecret, req);
  const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
  return { ...toQrDto(deps.db, req), payload, qrDataUrl };
}

export async function qrPng(deps: Deps, id: string) {
  const req = deps.db.select().from(qrRequests).where(eq(qrRequests.id, id)).get();
  if (!req) throw notFound("QR request");
  return QRCode.toBuffer(buildPayload(deps.config.qrSigningSecret, req), { margin: 1, width: 320 });
}

export function getOwnQrRequest(deps: Deps, customerId: string, id: string) {
  const wallet = getWalletByCustomer(deps.db, customerId);
  const req = deps.db
    .select()
    .from(qrRequests)
    .where(and(eq(qrRequests.id, id), eq(qrRequests.payeeWalletId, wallet.id)))
    .get();
  if (!req) throw notFound("QR request");
  return refreshExpiry(deps.db, req);
}

export function listOwnQrRequests(deps: Deps, customerId: string, status?: QrRequestStatus) {
  const wallet = getWalletByCustomer(deps.db, customerId);
  return deps.db
    .select()
    .from(qrRequests)
    .where(and(eq(qrRequests.payeeWalletId, wallet.id), status ? eq(qrRequests.status, status) : undefined))
    .orderBy(desc(qrRequests.id))
    .limit(50)
    .all()
    .map((r) => refreshExpiry(deps.db, r))
    .filter((r) => !status || r.status === status)
    .map((r) => toQrDto(deps.db, r));
}

export function cancelQrRequest(deps: Deps, customerId: string, id: string) {
  const req = getOwnQrRequest(deps, customerId, id);
  if (req.status !== "OPEN") {
    throw new AppError(409, "CONFLICT", `QR request is already ${req.status.toLowerCase()}`);
  }
  return deps.db
    .update(qrRequests)
    .set({ status: "CANCELLED" })
    .where(eq(qrRequests.id, id))
    .returning()
    .get()!;
}

/** Payer side: preview what they are about to pay. */
export function resolveQr(deps: Deps, payload: string) {
  return toQrDto(deps.db, parsePayload(deps.db, deps.config.qrSigningSecret, payload));
}

/** Payer side: pay the request. */
export function payQr(
  deps: Deps,
  input: { customerId: string; payload: string; idempotencyKey?: string },
): PaymentOutcome {
  const { db, rails, config } = deps;
  const req = parsePayload(db, config.qrSigningSecret, input.payload);
  const payer = getWalletByCustomer(db, input.customerId);

  const existing = findIdempotent(db, input.customerId, input.idempotencyKey, {
    type: "QR_PAYMENT",
    amountCents: req.amountCents,
    toWalletId: req.payeeWalletId,
  });
  if (existing) return { transaction: existing, replayed: true };

  if (req.payeeWalletId === payer.id) throw new AppError(422, "SELF_TRANSFER", "You cannot pay your own QR code");
  if (req.status === "PAID") throw new AppError(409, "QR_ALREADY_PAID", "This QR code has already been paid");
  if (req.status === "EXPIRED") throw new AppError(410, "QR_EXPIRED", "This QR code has expired");
  if (req.status === "CANCELLED") throw new AppError(410, "QR_EXPIRED", "This QR code was cancelled");

  const txn = insertPendingTransaction(db, {
    type: "QR_PAYMENT",
    rail: "INTERNAL",
    amountCents: req.amountCents,
    fromWalletId: payer.id,
    toWalletId: req.payeeWalletId,
    initiatedBy: input.customerId,
    description: req.description ?? "QR payment",
    idempotencyKey: input.idempotencyKey ?? null,
    qrRequestId: req.id,
  });

  // Money movement + marking the request PAID commit together, or not at all.
  rails.INTERNAL.settle(txn.id, (tx) => {
    const claimed = tx
      .update(qrRequests)
      .set({ status: "PAID", paidByTransactionId: txn.id })
      .where(and(eq(qrRequests.id, req.id), eq(qrRequests.status, "OPEN")))
      .returning({ id: qrRequests.id })
      .get();
    if (!claimed) throw new AppError(409, "QR_ALREADY_PAID", "This QR code has already been paid");
  });

  return { transaction: loadTransaction(deps, txn.id), replayed: false };
}

