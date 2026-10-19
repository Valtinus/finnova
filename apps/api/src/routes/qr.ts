import { createRoute, z } from "@hono/zod-openapi";
import { QR_REQUEST_STATUSES } from "@finnova/shared";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import {
  AmountCents,
  IdempotencyKeyHeader,
  QrRequestSchema,
  TransactionSchema,
  errorJson,
  errorResponses,
  json,
} from "../schemas";
import { failedPaymentError } from "../services/payments";
import {
  cancelQrRequest,
  createQrRequest,
  getOwnQrRequest,
  listOwnQrRequests,
  payQr,
  qrPng,
  resolveQr,
  toQrDto,
  withQrImage,
} from "../services/qr";
import { getTransactionForViewer } from "../services/transactions";
import { getWalletByCustomer } from "../services/wallets";

const TAG = ["QR Payments"];
const auth = requireAuth;

const QrWithImageSchema = QrRequestSchema.extend({
  payload: z.string().openapi({
    description: "Text encoded in the QR code",
    example: "finnova://pay?rid=qr_0192...&sig=Xy3...",
  }),
  qrDataUrl: z.string().openapi({ description: "PNG image as data URL — drop into <img src>" }),
}).openapi("QrRequestWithImage");

const PayloadBody = z.object({
  payload: z.string().min(10).openapi({ example: "finnova://pay?rid=qr_0192...&sig=Xy3..." }),
});

/* ---- payee side ---- */

const create = createRoute({
  method: "post",
  path: "/",
  tags: TAG,
  summary: "Create a payment request + QR code (payee / merchant side)",
  security: bearer,
  middleware: auth,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            amountCents: AmountCents.openapi({ example: 450 }),
            description: z.string().max(140).optional().openapi({ example: "Flat white ☕" }),
            expiresInSeconds: z.number().int().min(30).max(86_400).optional().openapi({ example: 900 }),
          }),
        },
      },
    },
  },
  responses: {
    201: json(QrWithImageSchema, "Payment request with QR image"),
    400: errorResponses[400],
    401: errorResponses[401],
    422: errorJson("WALLET_FROZEN / LIMIT_EXCEEDED"),
  },
});

const list = createRoute({
  method: "get",
  path: "/",
  tags: TAG,
  summary: "List my payment requests",
  security: bearer,
  middleware: auth,
  request: { query: z.object({ status: z.enum(QR_REQUEST_STATUSES).optional() }) },
  responses: {
    200: json(z.object({ data: z.array(QrRequestSchema) }), "Payment requests"),
    401: errorResponses[401],
  },
});

const getOne = createRoute({
  method: "get",
  path: "/{id}",
  tags: TAG,
  summary: "Get one of my payment requests (poll this to see when it's PAID)",
  security: bearer,
  middleware: auth,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: json(QrWithImageSchema, "Payment request"),
    401: errorResponses[401],
    404: errorJson("Not found"),
  },
});

const cancel = createRoute({
  method: "delete",
  path: "/{id}",
  tags: TAG,
  summary: "Cancel an open payment request",
  security: bearer,
  middleware: auth,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: json(QrRequestSchema, "Cancelled"),
    401: errorResponses[401],
    404: errorJson("Not found"),
    409: errorJson("Already paid / expired"),
  },
});

const image = createRoute({
  method: "get",
  path: "/{id}/image.png",
  tags: TAG,
  summary: "QR code as PNG (public, so it works in <img src>)",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "PNG image", content: { "image/png": { schema: z.any() } } },
    404: errorJson("Not found"),
  },
});

/* ---- payer side ---- */

const resolve = createRoute({
  method: "post",
  path: "/resolve",
  tags: TAG,
  summary: "Preview a scanned QR (payer side) — shows amount and payee before paying",
  security: bearer,
  middleware: auth,
  request: { body: { required: true, content: { "application/json": { schema: PayloadBody } } } },
  responses: {
    200: json(QrRequestSchema, "Payment request details"),
    400: errorJson("QR_INVALID"),
    401: errorResponses[401],
  },
});

const pay = createRoute({
  method: "post",
  path: "/pay",
  tags: TAG,
  summary: "Pay a scanned QR code (payer side)",
  security: bearer,
  middleware: auth,
  request: {
    headers: IdempotencyKeyHeader,
    body: { required: true, content: { "application/json": { schema: PayloadBody } } },
  },
  responses: {
    201: json(TransactionSchema, "Paid"),
    200: json(TransactionSchema, "Idempotent replay"),
    400: errorJson("QR_INVALID"),
    401: errorResponses[401],
    409: errorJson("QR_ALREADY_PAID"),
    410: errorJson("QR_EXPIRED"),
    422: errorJson("INSUFFICIENT_FUNDS / SELF_TRANSFER / WALLET_FROZEN"),
  },
});

export const qrRoutes = createRouter()
  // static paths first so they don't match /{id}
  .openapi(resolve, async (c) => {
    return c.json(resolveQr(c.var.deps, c.req.valid("json").payload), 200);
  })
  .openapi(pay, (c) => {
    const deps = c.var.deps;
    const { "idempotency-key": idempotencyKey } = c.req.valid("header");
    const { transaction, replayed } = payQr(deps, {
      customerId: c.var.customerId,
      payload: c.req.valid("json").payload,
      idempotencyKey,
    });
    if (transaction.status === "FAILED") throw failedPaymentError(transaction);
    const wallet = getWalletByCustomer(deps.db, c.var.customerId);
    const dto = getTransactionForViewer(deps.db, transaction.id, wallet.id, c.var.customerId);
    if (replayed) c.header("Idempotent-Replayed", "true");
    return replayed ? c.json(dto, 200) : c.json(dto, 201);
  })
  .openapi(create, async (c) => {
    return c.json(await createQrRequest(c.var.deps, c.var.customerId, c.req.valid("json")), 201);
  })
  .openapi(list, (c) => {
    return c.json({ data: listOwnQrRequests(c.var.deps, c.var.customerId, c.req.valid("query").status) }, 200);
  })
  .openapi(image, async (c) => {
    const png = await qrPng(c.var.deps, c.req.valid("param").id);
    return c.body(new Uint8Array(png), 200, { "content-type": "image/png", "cache-control": "no-store" });
  })
  .openapi(getOne, async (c) => {
    const req = getOwnQrRequest(c.var.deps, c.var.customerId, c.req.valid("param").id);
    return c.json(await withQrImage(c.var.deps, req), 200);
  })
  .openapi(cancel, (c) => {
    const req = cancelQrRequest(c.var.deps, c.var.customerId, c.req.valid("param").id);
    return c.json(toQrDto(c.var.deps.db, req), 200);
  });
