import { createRoute, z } from "@hono/zod-openapi";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import { AmountCents, IdempotencyKeyHeader, TransactionSchema, errorJson, errorResponses, json } from "../schemas";
import { createTransfer, failedPaymentError } from "../services/payments";
import { getTransactionForViewer } from "../services/transactions";
import { getWalletByCustomer } from "../services/wallets";

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["P2P Transfers"],
  summary: "Send money to another FinNova customer",
  description:
    "Debits your wallet and credits the recipient atomically on the INTERNAL rail. " +
    "Send an `Idempotency-Key` header so a retried request never pays twice.",
  security: bearer,
  request: {
    headers: IdempotencyKeyHeader,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            to: z.string().min(3).openapi({
              description: "Recipient email, phone number or customer id",
              example: "bob@finnova.test",
            }),
            amountCents: AmountCents,
            description: z.string().max(140).optional().openapi({ example: "Pizza last night 🍕" }),
          }),
        },
      },
    },
  },
  responses: {
    201: json(TransactionSchema, "Transfer completed"),
    200: json(TransactionSchema, "Idempotent replay of an earlier completed transfer"),
    400: errorResponses[400],
    401: errorResponses[401],
    404: errorJson("Recipient not found"),
    409: errorJson("Idempotency key reused with different parameters"),
    422: errorJson("INSUFFICIENT_FUNDS / SELF_TRANSFER / WALLET_FROZEN / LIMIT_EXCEEDED"),
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const transferRoutes = router.openapi(create, (c) => {
  const deps = c.var.deps;
  const body = c.req.valid("json");
  const { "idempotency-key": idempotencyKey } = c.req.valid("header");

  const { transaction, replayed } = createTransfer(deps, {
    customerId: c.var.customerId,
    ...body,
    idempotencyKey,
  });
  if (transaction.status === "FAILED") throw failedPaymentError(transaction);

  const wallet = getWalletByCustomer(deps.db, c.var.customerId);
  const dto = getTransactionForViewer(deps.db, transaction.id, wallet.id, c.var.customerId);
  if (replayed) c.header("Idempotent-Replayed", "true");
  return replayed ? c.json(dto, 200) : c.json(dto, 201);
});
