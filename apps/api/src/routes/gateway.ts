import { createRoute, z } from "@hono/zod-openapi";
import { checkoutPage } from "../gateway/checkout-page";
import { TEST_CARDS } from "../gateway/mock-gateway";
import { createRouter } from "../lib/router";
import { errorJson, json } from "../schemas";

/**
 * Endpoints of the *simulated external* payment gateway.
 * No FinNova auth here — the checkout session id is the capability.
 */

const TAG = ["Mock Payment Gateway (simulated 3rd party)"];

const SessionSchema = z
  .object({
    id: z.string(),
    status: z.enum(["OPEN", "SUCCEEDED", "DECLINED", "EXPIRED"]),
    amountCents: z.number().int(),
    currency: z.string(),
    merchant: z.literal("FinNova Bank"),
    cardLast4: z.string().nullable(),
    declineReason: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("GatewaySession");

const checkout = createRoute({
  method: "get",
  path: "/checkout/{sessionId}",
  tags: TAG,
  summary: "Hosted checkout page (HTML) — open in a browser",
  request: { params: z.object({ sessionId: z.string() }) },
  responses: {
    200: { description: "HTML page", content: { "text/html": { schema: z.string() } } },
    404: errorJson("Unknown session"),
  },
});

const getSession = createRoute({
  method: "get",
  path: "/sessions/{sessionId}",
  tags: TAG,
  summary: "Checkout session details",
  request: { params: z.object({ sessionId: z.string() }) },
  responses: { 200: json(SessionSchema, "Session"), 404: errorJson("Unknown session") },
});

const pay = createRoute({
  method: "post",
  path: "/sessions/{sessionId}/pay",
  tags: TAG,
  summary: "Submit card details (use the test cards below)",
  description: [
    "Test cards — any future expiry, any 3-digit CVC:",
    `- \`${TEST_CARDS.success}\` → success`,
    `- \`${TEST_CARDS.declined}\` → card_declined`,
    `- \`${TEST_CARDS.insufficientFunds}\` → insufficient_funds`,
    `- \`${TEST_CARDS.expired}\` → expired_card`,
    "",
    "On completion the gateway sends a signed webhook to `POST /webhooks/gateway`.",
  ].join("\n"),
  request: {
    params: z.object({ sessionId: z.string() }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            number: z.string().openapi({ example: TEST_CARDS.success }),
            expMonth: z.number().int().min(1).max(12).openapi({ example: 12 }),
            expYear: z.number().int().min(2000).max(2100).openapi({ example: 2030 }),
            cvc: z.string().openapi({ example: "123" }),
          }),
        },
      },
    },
  },
  responses: {
    200: json(
      z.object({
        sessionId: z.string(),
        status: z.enum(["OPEN", "SUCCEEDED", "DECLINED", "EXPIRED"]),
        declineReason: z.string().nullable(),
        transactionId: z.string(),
        returnUrl: z.string().nullable(),
      }),
      "Card processed (check `status`)",
    ),
    400: errorJson("Invalid card data"),
    404: errorJson("Unknown session"),
    409: errorJson("Session already completed"),
  },
});

export const gatewayRoutes = createRouter()
  .openapi(checkout, (c) => {
    const session = c.var.deps.gateway.getSession(c.req.valid("param").sessionId);
    return c.html(checkoutPage(session), 200);
  })
  .openapi(getSession, (c) => {
    const s = c.var.deps.gateway.getSession(c.req.valid("param").sessionId);
    return c.json(
      {
        id: s.id,
        status: s.status,
        amountCents: s.amountCents,
        currency: s.currency,
        merchant: "FinNova Bank" as const,
        cardLast4: s.cardLast4,
        declineReason: s.declineReason,
        createdAt: s.createdAt,
      },
      200,
    );
  })
  .openapi(pay, async (c) => {
    const result = await c.var.deps.gateway.pay(c.req.valid("param").sessionId, c.req.valid("json"));
    return c.json(result, 200);
  });
