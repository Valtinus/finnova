/** Central runtime configuration (Bun auto-loads .env). */
export interface AppConfig {
  port: number;
  publicUrl: string;
  databasePath: string;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  qrSigningSecret: string;
  gatewayWebhookSecret: string;
  corsOrigins: string[];
  qrDefaultTtlSeconds: number;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = process.env;
  const port = Number(env.PORT ?? 3000);
  return {
    port,
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`,
    databasePath: env.DATABASE_PATH ?? "./data/finnova.sqlite",
    jwtSecret: env.JWT_SECRET ?? "dev-jwt-secret-change-me",
    jwtExpiresInSeconds: Number(env.JWT_EXPIRES_IN_SECONDS ?? 86_400),
    qrSigningSecret: env.QR_SIGNING_SECRET ?? "dev-qr-secret-change-me",
    gatewayWebhookSecret: env.GATEWAY_WEBHOOK_SECRET ?? "dev-gateway-webhook-secret",
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    qrDefaultTtlSeconds: Number(env.QR_DEFAULT_TTL_SECONDS ?? 900),
    ...overrides,
  };
}
