import { createRoute, z } from "@hono/zod-openapi";
import { WALLET_STATUSES } from "@finnova/shared";
import { AppError } from "../lib/errors";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import { LedgerEntrySchema, WalletSchema, errorJson, errorResponses, json } from "../schemas";
import {
  createWallet,
  findWalletByCustomer,
  getWalletByCustomer,
  listLedger,
  toWalletDto,
  updateWallet,
} from "../services/wallets";

const getWallet = createRoute({
  method: "get",
  path: "/",
  tags: ["Wallet"],
  summary: "Get my wallet and balance",
  security: bearer,
  responses: {
    200: json(WalletSchema, "Wallet"),
    401: errorResponses[401],
    404: errorJson("Customer has no wallet"),
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Wallet"],
  summary: "Create my wallet (only needed if it doesn't exist yet)",
  security: bearer,
  request: {
    body: {
      required: false,
      content: {
        "application/json": {
          schema: z.object({ nickname: z.string().max(40).optional().openapi({ example: "Main wallet" }) }),
        },
      },
    },
  },
  responses: {
    201: json(WalletSchema, "Wallet created"),
    401: errorResponses[401],
    409: errorJson("Wallet already exists"),
  },
});

const update = createRoute({
  method: "patch",
  path: "/",
  tags: ["Wallet"],
  summary: "Rename, freeze or unfreeze my wallet",
  description: "A FROZEN wallet can neither send nor receive money.",
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            nickname: z.string().max(40).nullable().optional().openapi({ example: "Everyday spending" }),
            status: z.enum(WALLET_STATUSES).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: json(WalletSchema, "Updated wallet"),
    400: errorResponses[400],
    401: errorResponses[401],
  },
});

const ledger = createRoute({
  method: "get",
  path: "/ledger",
  tags: ["Wallet"],
  summary: "Ledger lines (statement) with running balance",
  security: bearer,
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      before: z.string().optional().openapi({ description: "Cursor: ledger entry id" }),
    }),
  },
  responses: {
    200: json(z.object({ data: z.array(LedgerEntrySchema) }), "Ledger entries, newest first"),
    401: errorResponses[401],
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const walletRoutes = router
  .openapi(getWallet, (c) => {
    return c.json(toWalletDto(getWalletByCustomer(c.var.deps.db, c.var.customerId)), 200);
  })
  .openapi(create, async (c) => {
    const { db } = c.var.deps;
    if (findWalletByCustomer(db, c.var.customerId)) {
      throw new AppError(409, "CONFLICT", "You already have a EUR wallet");
    }
    const body = await c.req.json().catch(() => ({}));
    const nickname = typeof body?.nickname === "string" ? body.nickname : "Main wallet";
    return c.json(toWalletDto(createWallet(db, c.var.customerId, nickname)), 201);
  })
  .openapi(update, (c) => {
    return c.json(toWalletDto(updateWallet(c.var.deps.db, c.var.customerId, c.req.valid("json"))), 200);
  })
  .openapi(ledger, (c) => {
    const { db } = c.var.deps;
    const { limit, before } = c.req.valid("query");
    const wallet = getWalletByCustomer(db, c.var.customerId);
    return c.json({ data: listLedger(db, wallet.id, limit, before) }, 200);
  });
