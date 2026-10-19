import { createRoute, z } from "@hono/zod-openapi";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "@finnova/shared";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import { TransactionSchema, errorJson, errorResponses, json } from "../schemas";
import { getTransactionForViewer, listTransactions } from "../services/transactions";
import { getWalletByCustomer } from "../services/wallets";

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Payment History"],
  summary: "List my transactions (newest first)",
  security: bearer,
  request: {
    query: z.object({
      type: z.enum(TRANSACTION_TYPES).optional(),
      status: z.enum(TRANSACTION_STATUSES).optional(),
      direction: z.enum(["IN", "OUT"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      before: z.string().optional().openapi({ description: "Cursor from `nextCursor` of the previous page" }),
    }),
  },
  responses: {
    200: json(
      z.object({ data: z.array(TransactionSchema), nextCursor: z.string().nullable() }).openapi("TransactionPage"),
      "A page of transactions",
    ),
    400: errorResponses[400],
    401: errorResponses[401],
  },
});

const get = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Payment History"],
  summary: "Transaction details / receipt",
  security: bearer,
  request: { params: z.object({ id: z.string().openapi({ example: "txn_0192..." }) }) },
  responses: {
    200: json(TransactionSchema, "Transaction"),
    401: errorResponses[401],
    404: errorJson("Not found"),
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const transactionRoutes = router
  .openapi(list, (c) => {
    const { db } = c.var.deps;
    const wallet = getWalletByCustomer(db, c.var.customerId);
    return c.json(listTransactions(db, wallet.id, c.var.customerId, c.req.valid("query")), 200);
  })
  .openapi(get, (c) => {
    const { db } = c.var.deps;
    const wallet = getWalletByCustomer(db, c.var.customerId);
    return c.json(getTransactionForViewer(db, c.req.valid("param").id, wallet.id, c.var.customerId), 200);
  });
