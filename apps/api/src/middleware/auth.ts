import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import type { AppConfig } from "../config";
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";

export async function issueToken(config: AppConfig, customer: { id: string; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    { sub: customer.id, email: customer.email, iat: now, exp: now + config.jwtExpiresInSeconds },
    config.jwtSecret,
    "HS256",
  );
  return { token, expiresAt: new Date((now + config.jwtExpiresInSeconds) * 1000).toISOString() };
}

/** Requires `Authorization: Bearer <jwt>` and exposes c.var.customerId. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Missing bearer token");

  try {
    const payload = await verify(token, c.var.deps.config.jwtSecret, "HS256");
    if (typeof payload.sub !== "string") throw new Error("no sub");
    c.set("customerId", payload.sub);
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
  await next();
});
