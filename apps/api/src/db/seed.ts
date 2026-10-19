/**
 * Demo data: three customers with a realistic little payment history.
 * Everything goes through the real services (gateway, webhooks, ledger),
 * so balances and ledger lines are consistent.
 *
 *   alice@finnova.test / Password123!
 *   bob@finnova.test   / Password123!
 *   cafe@finnova.test  / Password123!   (merchant receiving QR payments)
 */
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { TEST_CARDS } from "../gateway/mock-gateway";
import { registerCustomer } from "../services/customers";
import { createTopup, createTransfer } from "../services/payments";
import { buildPayload, createQrRequest, payQr } from "../services/qr";
import { customers, qrRequests } from "./schema";

const PASSWORD = "Password123!";
const card = { number: TEST_CARDS.success, expMonth: 12, expYear: 2030, cvc: "123" };

const { deps } = createApp({ quiet: true });
const { db, gateway, config } = deps;

if (db.select().from(customers).where(eq(customers.email, "alice@finnova.test")).get()) {
  console.log("✔ Seed data already present — run `bun run db:reset` to start over.");
  process.exit(0);
}

const alice = await registerCustomer(db, {
  email: "alice@finnova.test",
  password: PASSWORD,
  fullName: "Alice Kovács",
  phone: "+36301111111",
});
const bob = await registerCustomer(db, {
  email: "bob@finnova.test",
  password: PASSWORD,
  fullName: "Bob Nagy",
  phone: "+36302222222",
});
const cafe = await registerCustomer(db, {
  email: "cafe@finnova.test",
  password: PASSWORD,
  fullName: "FinNova Café",
  phone: "+36303333333",
});

async function topup(customerId: string, amountCents: number, cardNumber: string = card.number) {
  const { sessionId } = await createTopup(deps, { customerId, amountCents });
  await gateway.pay(sessionId!, { ...card, number: cardNumber });
}

// Card top-ups via the mock gateway (+ one declined attempt for the history screen)
await topup(alice.customer.id, 25_000);
await topup(bob.customer.id, 10_000);
await topup(bob.customer.id, 2_000, TEST_CARDS.declined);

// P2P transfers
createTransfer(deps, { customerId: alice.customer.id, to: "bob@finnova.test", amountCents: 1_250, description: "Pizza last night 🍕" });
createTransfer(deps, { customerId: bob.customer.id, to: "+36301111111", amountCents: 500, description: "Coffee ☕" });
createTransfer(deps, { customerId: bob.customer.id, to: "alice@finnova.test", amountCents: 50_000, description: "Rent share (fails: insufficient funds)" });

// QR: café requests €4.50, Alice scans & pays
const paidQr = await createQrRequest(deps, cafe.customer.id, { amountCents: 450, description: "Flat white" });
payQr(deps, { customerId: alice.customer.id, payload: paidQr.payload });

// An open QR request, ready to be paid in the demo
const openQr = await createQrRequest(deps, cafe.customer.id, {
  amountCents: 320,
  description: "Croissant 🥐",
  expiresInSeconds: 86_400,
});

const qr = db.select().from(qrRequests).where(eq(qrRequests.id, openQr.id)).get()!;

console.log(`
✔ Seeded demo data into ${config.databasePath}

  Login (password: ${PASSWORD})
    alice@finnova.test   €238.00
    bob@finnova.test     €107.50
    cafe@finnova.test    merchant, €4.50

  Open QR payment request (€3.20, valid 24h) — pay it as Alice or Bob via POST /qr/pay:
    ${buildPayload(config.qrSigningSecret, qr)}
`);
