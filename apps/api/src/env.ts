import type { AppConfig } from "./config";
import type { DB } from "./db/client";
import type { MockGateway } from "./gateway/mock-gateway";
import type { RailRegistry } from "./rails";

/** Everything a request handler needs, created once in createApp(). */
export interface Deps {
  db: DB;
  config: AppConfig;
  rails: RailRegistry;
  gateway: MockGateway;
}

export interface AppEnv {
  Variables: {
    deps: Deps;
    /** set by requireAuth */
    customerId: string;
    /** set on webhook routes for signature verification */
    rawBody?: string;
  };
}
