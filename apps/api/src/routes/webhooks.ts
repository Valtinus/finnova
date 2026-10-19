import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { transactions } from "../db/schema";
import type { AppEnv } from "../env";
import type { GatewayEvent } from "../gateway/mock-gateway";
import { verifyWebhook } from "../gateway/signature";
import { AppError, notFound } from "../lib/errors";
import { createRouter } from "../lib/router";
import { errorJson, json } from "../schemas";

/** Read the raw body *before* JSON validation so the HMAC is checked against the exact bytes sent. */
const captureRawBody = createMiddleware<AppEnv>(async (c, next) => {
  c.set("rawBody", await c.req.text());
  await next();
});

const gatewayWebhook = createRoute({
  method: "post",
  path: "/gateway",
  tags: ["Webhooks"],
  middleware: captureRawBody,
  summary: "Payment gateway → FinNova webhook (signed)",
  description:
    "Called by the payment gateway when a checkout succeeds or fails. " +
    "Verified with the `X-Gateway-Signature: t=<ts>,v1=<hmac>` header. Safe to receive more than once.",
  request: {
    headers: z.object({ "x-gateway-signature": z.string().openapi({ example: "t=1760870000,v1=ab12..." }) }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            type: z.enum(["payment.succeeded", "payment.failed"]),
            created: z.number(),
            data: z.object({
              sessionId: z.string(),
              transactionId: z.string(),
              amountCents: z.number().int(),
              currency: z.string(),
              cardLast4: z.string().nullable(),
              declineReason: z.string().nullable(),
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: json(z.object({ received: z.boolean(), status: z.string() }), "Processed"),
    400: errorJson("Bad payload"),
    401: errorJson("INVALID_SIGNATURE"),
  },
});

export const webhookRoutes = createRouter().openapi(gatewayWebhook, async (c) => {
  const { db, config, rails } = c.var.deps;

  const raw = c.var.rawBody ?? "";
  if (!verifyWebhook(config.gatewayWebhookSecret, raw, c.req.header("x-gateway-signature"))) {
    throw new AppError(401, "INVALID_SIGNATURE", "Webhook signature verification failed");
  }
  const event = c.req.valid("json") as GatewayEvent;

  const txn = db.select().from(transactions).where(eq(transactions.id, event.data.transactionId)).get();
  if (!txn || txn.rail !== "CARD") throw notFound("Transaction");
  if (txn.amountCents !== event.data.amountCents || txn.externalRef !== event.data.sessionId) {
    throw new AppError(400, "GATEWAY_ERROR", "Webhook does not match the transaction");
  }

  const result =
    event.type === "payment.succeeded"
      ? await rails.CARD.confirm(txn.id, event.data.sessionId)
      : await rails.CARD.fail(txn.id, `GATEWAY_${(event.data.declineReason ?? "declined").toUpperCase()}`);

  return c.json({ received: true, status: result.status }, 200);
});
