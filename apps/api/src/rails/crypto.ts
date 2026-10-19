import type { PaymentRail, RailInitiateInput, RailResult, TransactionStatus } from "@finnova/shared";
import { AppError } from "../lib/errors";

/**
 * CRYPTO rail — placeholder for the decentralized payments module.
 *
 * Suggested implementation later:
 *   initiate() -> create a deposit address / build a stablecoin transfer (e.g. USDC on a testnet),
 *                 return status PENDING with externalRef = tx hash or address
 *   confirm()  -> called by a chain watcher once N confirmations are seen;
 *                 credit wallet + postExternal(tx, "crypto_clearing", ...)
 *   fail()     -> reverted / timed-out transfers
 *
 * Register it in rails/index.ts — the transactions table already has a `rail` column.
 */
export class CryptoRail implements PaymentRail {
  readonly id = "CRYPTO" as const;

  private notYet(): never {
    throw new AppError(501, "NOT_IMPLEMENTED", "Crypto rail is not implemented yet");
  }

  async initiate(_input: RailInitiateInput): Promise<RailResult> {
    this.notYet();
  }
  async confirm(_transactionId: string, _externalRef: string): Promise<RailResult> {
    this.notYet();
  }
  async fail(_transactionId: string, _reason: string): Promise<RailResult> {
    this.notYet();
  }
  async getStatus(_transactionId: string): Promise<TransactionStatus> {
    this.notYet();
  }
}
