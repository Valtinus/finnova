import type { AppConfig } from "../config";
import type { DB } from "../db/client";
import type { MockGateway } from "../gateway/mock-gateway";
import { CardGatewayRail } from "./card";
import { CryptoRail } from "./crypto";
import { InternalLedgerRail } from "./internal";

export function createRails(db: DB, gateway: MockGateway, config: AppConfig) {
  return {
    INTERNAL: new InternalLedgerRail(db),
    CARD: new CardGatewayRail(db, gateway, config),
    CRYPTO: new CryptoRail(), // not wired to any endpoint yet
  };
}

export type RailRegistry = ReturnType<typeof createRails>;

export { CardGatewayRail, CryptoRail, InternalLedgerRail };
