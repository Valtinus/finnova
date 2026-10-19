import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { loadConfig, type AppConfig } from "./config";
import { createDb, type DB } from "./db/client";
import type { Deps } from "./env";
import { MockGateway } from "./gateway/mock-gateway";
import { AppError } from "./lib/errors";
import { createRouter } from "./lib/router";
import { createRails } from "./rails";
import { authRoutes } from "./routes/auth";
import { customerRoutes } from "./routes/customers";
import { gatewayRoutes } from "./routes/gateway";
import { qrRoutes } from "./routes/qr";
import { topupRoutes } from "./routes/topups";
import { transactionRoutes } from "./routes/transactions";
import { transferRoutes } from "./routes/transfers";
import { walletRoutes } from "./routes/wallet";
import { webhookRoutes } from "./routes/webhooks";

export interface CreateAppOptions {
  config?: Partial<AppConfig>;
  db?: DB;
  /** disable request logging (tests) */
  quiet?: boolean;
}

export function createApp(opts: CreateAppOptions = {}) {
  const config = loadConfig(opts.config);
  const db = opts.db ?? createDb(config.databasePath);
  const gateway = new MockGateway(db, config);
  const rails = createRails(db, gateway, config);
  const deps: Deps = { db, config, rails, gateway };

  const base = createRouter();

  if (!opts.quiet) base.use("*", logger());
  base.use("*", cors({ origin: config.corsOrigins, allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"], exposeHeaders: ["Idempotent-Replayed"] }));
  base.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  base.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    if (err instanceof HTTPException) {
      return c.json({ error: { code: "HTTP_ERROR", message: err.message } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } }, 500);
  });

  base.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: `No route for ${c.req.method} ${c.req.path}` } }, 404));

  base.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Get a token from POST /auth/login (demo: alice@finnova.test / Password123!)",
  });

  const app = base
    .get("/", (c) => c.redirect("/docs"))
    .get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }))
    .route("/auth", authRoutes)
    .route("/wallet", walletRoutes)
    .route("/customers", customerRoutes)
    .route("/transfers", transferRoutes)
    .route("/topups", topupRoutes)
    .route("/qr", qrRoutes)
    .route("/transactions", transactionRoutes)
    .route("/webhooks", webhookRoutes)
    .route("/gateway", gatewayRoutes);

  base.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "FinNova Wallet API",
      version: "0.1.0",
      description: [
        "Digital wallet & payments API for the FinNova Bank platform.",
        "",
        "**Quick start in Swagger UI**",
        "1. `POST /auth/login` with `alice@finnova.test` / `Password123!`",
        "2. Copy `token`, click **Authorize**, paste it",
        "3. Try `GET /wallet`, `POST /transfers` (to `bob@finnova.test`), `POST /qr`, `GET /transactions`",
        "",
        "All amounts are **integer euro cents** (`1250` = €12.50).",
      ].join("\n"),
    },
    servers: [{ url: config.publicUrl, description: "Local" }],
    tags: [
      { name: "Auth" },
      { name: "Wallet", description: "Digital wallet & balance management" },
      { name: "P2P Transfers", description: "Wallet-to-wallet transfers" },
      { name: "QR Payments", description: "Request money with a QR code, pay by scanning" },
      { name: "Top-ups (Payment Gateway)", description: "Load money from a card through the payment gateway" },
      { name: "Payment History" },
      { name: "Webhooks", description: "Callbacks from external payment providers" },
      { name: "Mock Payment Gateway (simulated 3rd party)", description: "Stands in for a real card gateway" },
    ],
  });

  base.get("/docs", swaggerUI({ url: "/openapi.json", persistAuthorization: true, title: "FinNova API" }));

  // Deliver gateway webhooks in-process (still goes through signature verification + routing).
  gateway.setWebhookDispatcher(async (rawBody, signature) => {
    const res = await app.request("/webhooks/gateway", {
      method: "POST",
      headers: { "content-type": "application/json", "x-gateway-signature": signature },
      body: rawBody,
    });
    if (!res.ok) console.error("Webhook delivery failed", res.status, await res.text());
  });

  return { app, deps };
}

/** Type for the Hono RPC client in apps/web: `hc<AppType>("http://localhost:3000")` */
export type AppType = ReturnType<typeof createApp>["app"];
