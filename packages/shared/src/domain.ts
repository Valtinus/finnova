export const CURRENCY = "EUR" as const;
export type Currency = typeof CURRENCY;

export const TRANSACTION_TYPES = ["TOPUP", "TRANSFER", "QR_PAYMENT"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * Payment rails = the "pipes" money moves over.
 * - INTERNAL: FinNova's own ledger (wallet <-> wallet)
 * - CARD:     external card payment gateway (top-ups)
 * - CRYPTO:   reserved for the upcoming decentralized payments module
 */
export const PAYMENT_RAILS = ["INTERNAL", "CARD", "CRYPTO"] as const;
export type PaymentRailId = (typeof PAYMENT_RAILS)[number];

export const WALLET_STATUSES = ["ACTIVE", "FROZEN"] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export const QR_REQUEST_STATUSES = ["OPEN", "PAID", "EXPIRED", "CANCELLED"] as const;
export type QrRequestStatus = (typeof QR_REQUEST_STATUSES)[number];

/** Direction of a transaction from the point of view of the viewing customer. */
export type Direction = "IN" | "OUT";

/** QR payload scheme: finnova://pay?rid=<requestId>&sig=<hmac> */
export const QR_SCHEME = "finnova://pay";

/** Limits (in cents) */
export const LIMITS = {
  minAmountCents: 1,
  maxTransferCents: 1_000_000, // 10,000.00 EUR per transfer
  maxTopupCents: 500_000, // 5,000.00 EUR per top-up
} as const;
