import { eq } from "drizzle-orm";
import type { AppConfig } from "../config";
import type { DB } from "../db/client";
import { gatewaySessions, type GatewaySession } from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { signWebhook } from "./signature";

/**
 * A simulated third-party card payment gateway (think "Stripe test mode").
 *
 * It lives in this process for convenience, but behaves like an external
 * provider: FinNova only learns about the outcome through a signed webhook
 * sent to POST /webhooks/gateway.
 *
 * Test cards (any future expiry, any 3-digit CVC):
 *   4242 4242 4242 4242  -> success
 *   4000 0000 0000 0002  -> declined (card_declined)
 *   4000 0000 0000 9995  -> declined (insufficient_funds)
 *   4000 0000 0000 0069  -> declined (expired_card)
 *   any other Luhn-valid number -> success
 */

export const TEST_CARDS = {
  success: "4242424242424242",
  declined: "4000000000000002",
  insufficientFunds: "4000000000009995",
  expired: "4000000000000069",
} as const;

const DECLINES: Record<string, string> = {
  [TEST_CARDS.declined]: "card_declined",
  [TEST_CARDS.insufficientFunds]: "insufficient_funds",
  [TEST_CARDS.expired]: "expired_card",
};

const SESSION_TTL_MS = 30 * 60 * 1000;

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

export interface GatewayEvent {
  id: string;
  type: "payment.succeeded" | "payment.failed";
  created: number;
  data: {
    sessionId: string;
    transactionId: string;
    amountCents: number;
    currency: string;
    cardLast4: string | null;
    declineReason: string | null;
  };
}

export type WebhookDispatcher = (rawBody: string, signature: string) => Promise<void>;

export class MockGateway {
  private dispatcher: WebhookDispatcher;

  constructor(
    private readonly db: DB,
    private readonly config: AppConfig,
  ) {
    // Default: deliver over HTTP like a real provider would.
    this.dispatcher = async (rawBody, signature) => {
      await fetch(`${config.publicUrl}/webhooks/gateway`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-gateway-signature": signature },
        body: rawBody,
      });
    };
  }

  /** createApp() swaps this for an in-process call so tests need no open port. */
  setWebhookDispatcher(fn: WebhookDispatcher) {
    this.dispatcher = fn;
  }

  createSession(input: {
    transactionId: string;
    amountCents: number;
    currency: string;
    returnUrl: string | null;
  }): GatewaySession {
    return this.db
      .insert(gatewaySessions)
      .values({ id: newId("gws"), ...input })
      .returning()
      .get();
  }

  getSession(id: string): GatewaySession {
    const session = this.db.select().from(gatewaySessions).where(eq(gatewaySessions.id, id)).get();
    if (!session) throw notFound("Checkout session");
    if (session.status === "OPEN" && Date.now() - Date.parse(session.createdAt) > SESSION_TTL_MS) {
      return this.finish(session, "EXPIRED", null, "session_expired");
    }
    return session;
  }

  /** Customer submits card details on the hosted checkout. */
  async pay(sessionId: string, card: CardInput) {
    const session = this.getSession(sessionId);
    if (session.status !== "OPEN") {
      throw new AppError(409, "CONFLICT", `Checkout session is already ${session.status.toLowerCase()}`);
    }

    const number = card.number.replace(/\s|-/g, "");
    if (!/^\d{12,19}$/.test(number) || !luhn(number)) {
      throw new AppError(400, "VALIDATION_ERROR", "Card number is invalid");
    }
    if (!/^\d{3,4}$/.test(card.cvc)) throw new AppError(400, "VALIDATION_ERROR", "CVC is invalid");

    const last4 = number.slice(-4);
    const expired = new Date(card.expYear, card.expMonth, 1) <= new Date(); // first day after expiry month
    const declineReason = expired ? "expired_card" : (DECLINES[number] ?? null);

    const updated = declineReason
      ? this.finish(session, "DECLINED", last4, declineReason)
      : this.finish(session, "SUCCEEDED", last4, null);

    await this.emit({
      id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
      type: declineReason ? "payment.failed" : "payment.succeeded",
      created: Math.floor(Date.now() / 1000),
      data: {
        sessionId: session.id,
        transactionId: session.transactionId,
        amountCents: session.amountCents,
        currency: session.currency,
        cardLast4: last4,
        declineReason,
      },
    });

    return {
      sessionId: updated.id,
      status: updated.status,
      declineReason: updated.declineReason,
      transactionId: updated.transactionId,
      returnUrl: buildReturnUrl(updated),
    };
  }

  private finish(
    session: GatewaySession,
    status: GatewaySession["status"],
    cardLast4: string | null,
    declineReason: string | null,
  ) {
    return this.db
      .update(gatewaySessions)
      .set({ status, cardLast4, declineReason })
      .where(eq(gatewaySessions.id, session.id))
      .returning()
      .get()!;
  }

  private async emit(event: GatewayEvent) {
    const raw = JSON.stringify(event);
    await this.dispatcher(raw, signWebhook(this.config.gatewayWebhookSecret, raw));
  }
}

function buildReturnUrl(session: GatewaySession): string | null {
  if (!session.returnUrl) return null;
  const url = new URL(session.returnUrl);
  url.searchParams.set("topup", session.transactionId);
  url.searchParams.set("status", session.status === "SUCCEEDED" ? "success" : "failed");
  return url.toString();
}

function luhn(num: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
