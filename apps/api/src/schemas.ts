import { z } from "@hono/zod-openapi";
import {
  LIMITS,
  PAYMENT_RAILS,
  QR_REQUEST_STATUSES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  WALLET_STATUSES,
} from "@finnova/shared";

/* ---------- primitives ---------- */

export const AmountCents = z
  .number()
  .int()
  .min(LIMITS.minAmountCents)
  .openapi({ description: "Amount in euro cents (integer). 1250 = €12.50", example: 1250 });

export const IdempotencyKeyHeader = z.object({
  "idempotency-key": z
    .string()
    .min(8)
    .max(100)
    .optional()
    .openapi({
      description:
        "Unique key per payment attempt (e.g. a UUID). Retrying with the same key returns the original result instead of paying twice.",
      example: "8f14e45f-ceea-467a-9575-1a2b3c4d5e6f",
    }),
});

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "INSUFFICIENT_FUNDS" }),
      message: z.string().openapi({ example: "Wallet balance is too low for this payment" }),
      details: z.any().optional(),
    }),
  })
  .openapi("Error");

/* ---------- domain ---------- */

export const CustomerSchema = z
  .object({
    id: z.string().openapi({ example: "cus_0192f0c3..." }),
    email: z.email(),
    phone: z.string().nullable(),
    fullName: z.string().openapi({ example: "Alice Kovács" }),
    createdAt: z.string(),
  })
  .openapi("Customer");

export const WalletSchema = z
  .object({
    id: z.string().openapi({ example: "wal_0192f0c3..." }),
    customerId: z.string(),
    currency: z.literal("EUR"),
    balanceCents: z.number().int().openapi({ example: 25000 }),
    balanceFormatted: z.string().openapi({ example: "€250.00" }),
    status: z.enum(WALLET_STATUSES),
    nickname: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Wallet");

export const PartySchema = z
  .object({
    customerId: z.string().nullable(),
    name: z.string().openapi({ example: "Bob Nagy" }),
    email: z.string().nullable().openapi({ example: "bo***@finnova.test" }),
  })
  .openapi("Party");

export const TransactionSchema = z
  .object({
    id: z.string(),
    reference: z.string().openapi({ example: "FN-7K2P9QXA" }),
    type: z.enum(TRANSACTION_TYPES),
    status: z.enum(TRANSACTION_STATUSES),
    rail: z.enum(PAYMENT_RAILS),
    direction: z.enum(["IN", "OUT"]).openapi({ description: "From the viewing customer's perspective" }),
    amountCents: z.number().int(),
    signedAmountCents: z.number().int().openapi({ description: "Negative when money left your wallet" }),
    amountFormatted: z.string().openapi({ example: "-€12.50" }),
    currency: z.string(),
    description: z.string().nullable(),
    counterparty: PartySchema.nullable(),
    failureReason: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi("Transaction");

export const LedgerEntrySchema = z
  .object({
    id: z.string(),
    transactionId: z.string(),
    direction: z.enum(["DEBIT", "CREDIT"]),
    amountCents: z.number().int(),
    balanceAfterCents: z.number().int().nullable(),
    createdAt: z.string(),
  })
  .openapi("LedgerEntry");

export const QrRequestSchema = z
  .object({
    id: z.string(),
    amountCents: z.number().int(),
    amountFormatted: z.string(),
    currency: z.string(),
    description: z.string().nullable(),
    status: z.enum(QR_REQUEST_STATUSES),
    payee: PartySchema,
    expiresAt: z.string(),
    createdAt: z.string(),
    paidByTransactionId: z.string().nullable(),
  })
  .openapi("QrRequest");

export const errorResponses = {
  400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
  401: { description: "Missing or invalid token", content: { "application/json": { schema: ErrorSchema } } },
} as const;

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

export const errorJson = (description: string) => json(ErrorSchema, description);
