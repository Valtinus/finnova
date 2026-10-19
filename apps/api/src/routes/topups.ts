import { createRoute, z } from "@hono/zod-openapi";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import { AmountCents, IdempotencyKeyHeader, TransactionSchema, errorJson, errorResponses, json } from "../schemas";
import { createTopup } from "../services/payments";
import { getTransactionForViewer } from "../services/transactions";
import { getWalletByCustomer } from "../services/wallets";

const TopupSchema = z
  .object({
    transaction: TransactionSchema,
    sessionId: z.string().nullable().openapi({ description: "Payment gateway checkout session id" }),
    checkoutUrl: z.string().nullable().openapi({
      description: "Hosted checkout page of the payment gateway — redirect the customer here",
      example: "http://localhost:3000/gateway/checkout/gws_0192...",
    }),
  })
  .openapi("Topup");

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Top-ups (Payment Gateway)"],
  summary: "Start a card top-up through the payment gateway",
  description:
    "Creates a PENDING TOPUP transaction and a checkout session on the payment gateway. " +
    "Redirect the customer to `checkoutUrl` (or POST card details to `/gateway/sessions/{id}/pay`). " +
    "The wallet is credited only when the gateway's signed webhook confirms the payment.",
  security: bearer,
  request: {
    headers: IdempotencyKeyHeader,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            amountCents: AmountCents.openapi({ example: 5000 }),
            returnUrl: z.url().optional().openapi({
              description: "Frontend URL to come back to after checkout (gets ?topup=<id>&status=success|failed)",
              example: "http://localhost:5173/wallet",
            }),
          }),
        },
      },
    },
  },
  responses: {
    201: json(TopupSchema, "Checkout session created (transaction is PENDING)"),
    200: json(TopupSchema, "Idempotent replay"),
    400: errorResponses[400],
    401: errorResponses[401],
    422: errorJson("WALLET_FROZEN / LIMIT_EXCEEDED"),
  },
});

const get = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Top-ups (Payment Gateway)"],
  summary: "Poll the status of a top-up",
  security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: json(TransactionSchema, "Top-up transaction"),
    401: errorResponses[401],
    404: errorJson("Not found"),
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const topupRoutes = router
  .openapi(create, async (c) => {
    const deps = c.var.deps;
    const { "idempotency-key": idempotencyKey } = c.req.valid("header");
    const result = await createTopup(deps, {
      customerId: c.var.customerId,
      ...c.req.valid("json"),
      idempotencyKey,
    });
    const wallet = getWalletByCustomer(deps.db, c.var.customerId);
    const body = {
      transaction: getTransactionForViewer(deps.db, result.transaction.id, wallet.id, c.var.customerId),
      sessionId: result.sessionId,
      checkoutUrl: result.checkoutUrl,
    };
    if (result.replayed) c.header("Idempotent-Replayed", "true");
    return result.replayed ? c.json(body, 200) : c.json(body, 201);
  })
  .openapi(get, (c) => {
    const { db } = c.var.deps;
    const wallet = getWalletByCustomer(db, c.var.customerId);
    return c.json(getTransactionForViewer(db, c.req.valid("param").id, wallet.id, c.var.customerId), 200);
  });
