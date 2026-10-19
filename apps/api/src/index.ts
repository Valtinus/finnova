import { createApp } from "./app";

const { app, deps } = createApp();
const { port, publicUrl, databasePath } = deps.config;

Bun.serve({ port, fetch: app.fetch });

console.log(`
  FinNova Wallet API
  ─────────────────────────────────────────
  API          ${publicUrl}
  Swagger UI   ${publicUrl}/docs
  OpenAPI      ${publicUrl}/openapi.json
  Database     ${databasePath}
`);
