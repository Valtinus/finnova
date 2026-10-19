import { createRoute, z } from "@hono/zod-openapi";
import { bearer, createRouter } from "../lib/router";
import { issueToken, requireAuth } from "../middleware/auth";
import { CustomerSchema, WalletSchema, errorJson, errorResponses, json } from "../schemas";
import { authenticate, getCustomer, registerCustomer, toCustomerDto } from "../services/customers";
import { findWalletByCustomer, toWalletDto } from "../services/wallets";

const SessionSchema = z
  .object({
    token: z.string().openapi({ description: "JWT — send as `Authorization: Bearer <token>`" }),
    expiresAt: z.string(),
    customer: CustomerSchema,
    wallet: WalletSchema.nullable(),
  })
  .openapi("Session");

const register = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  summary: "Register a customer (a EUR wallet is created automatically)",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            email: z.email().openapi({ example: "dora@finnova.test" }),
            password: z.string().min(8).max(128).openapi({ example: "Password123!" }),
            fullName: z.string().min(2).max(100).openapi({ example: "Dóra Szabó" }),
            phone: z.string().min(6).max(20).optional().openapi({ example: "+36301234567" }),
          }),
        },
      },
    },
  },
  responses: {
    201: json(SessionSchema, "Registered and logged in"),
    400: errorResponses[400],
    409: errorJson("Email or phone already registered"),
  },
});

const login = createRoute({
  method: "post",
  path: "/login",
  tags: ["Auth"],
  summary: "Log in with email + password",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            email: z.email().openapi({ example: "alice@finnova.test" }),
            password: z.string().openapi({ example: "Password123!" }),
          }),
        },
      },
    },
  },
  responses: {
    200: json(SessionSchema, "Logged in"),
    400: errorResponses[400],
    401: errorJson("Invalid credentials"),
  },
});

const me = createRoute({
  method: "get",
  path: "/me",
  tags: ["Auth"],
  summary: "Current customer",
  security: bearer,
  middleware: requireAuth,
  responses: {
    200: json(z.object({ customer: CustomerSchema, wallet: WalletSchema.nullable() }), "Current customer"),
    401: errorResponses[401],
  },
});

export const authRoutes = createRouter()
  .openapi(register, async (c) => {
    const { db, config } = c.var.deps;
    const { customer, wallet } = await registerCustomer(db, c.req.valid("json"));
    const session = await issueToken(config, customer);
    return c.json({ ...session, customer: toCustomerDto(customer), wallet: toWalletDto(wallet) }, 201);
  })
  .openapi(login, async (c) => {
    const { db, config } = c.var.deps;
    const { email, password } = c.req.valid("json");
    const customer = await authenticate(db, email, password);
    const wallet = findWalletByCustomer(db, customer.id);
    const session = await issueToken(config, customer);
    return c.json(
      { ...session, customer: toCustomerDto(customer), wallet: wallet ? toWalletDto(wallet) : null },
      200,
    );
  })
  .openapi(me, (c) => {
    const { db } = c.var.deps;
    const customer = getCustomer(db, c.var.customerId);
    const wallet = findWalletByCustomer(db, customer.id);
    return c.json({ customer: toCustomerDto(customer), wallet: wallet ? toWalletDto(wallet) : null }, 200);
  });
