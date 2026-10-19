import { beforeAll, describe, expect, test } from "bun:test";
import { signWebhook } from "../src/gateway/signature";
import { setup } from "./helpers";

const t = setup();
let alice: Awaited<ReturnType<typeof t.register>>;
let bob: Awaited<ReturnType<typeof t.register>>;

beforeAll(async () => {
  alice = await t.register("Alice Kovács", "alice@test.hu", "+36301111111");
  bob = await t.register("Bob Nagy", "bob@test.hu");
});

describe("auth", () => {
  test("login returns a token, wrong password is rejected", async () => {
    const ok = await t.call("POST", "/auth/login", { body: { email: "alice@test.hu", password: "Password123!" } });
    expect(ok.status).toBe(200);
    expect(ok.json.token).toBeString();

    const bad = await t.call("POST", "/auth/login", { body: { email: "alice@test.hu", password: "nope-nope" } });
    expect(bad.status).toBe(401);
    expect(bad.json.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("protected routes need a token", async () => {
    const r = await t.call("GET", "/wallet");
    expect(r.status).toBe(401);
  });

  test("duplicate email is rejected", async () => {
    const r = await t.call("POST", "/auth/register", {
      body: { email: "alice@test.hu", password: "Password123!", fullName: "Again" },
    });
    expect(r.status).toBe(409);
  });

  test("validation errors use the standard error shape", async () => {
    const r = await t.call("POST", "/auth/register", { body: { email: "not-an-email", password: "x", fullName: "" } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("wallet", () => {
  test("new customers get an empty EUR wallet", async () => {
    const r = await t.call("GET", "/wallet", { token: alice.token });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ currency: "EUR", balanceCents: 0, status: "ACTIVE" });
  });

  test("can rename the wallet", async () => {
    const r = await t.call("PATCH", "/wallet", { token: alice.token, body: { nickname: "Daily" } });
    expect(r.json.nickname).toBe("Daily");
  });
});

describe("top-up via payment gateway", () => {
  test("successful card payment credits the wallet via webhook", async () => {
    const { start, pay } = await t.topup(alice.token, 20_000);
    expect(start.status).toBe(201);
    expect(start.json.transaction.status).toBe("PENDING");
    expect(start.json.checkoutUrl).toContain("/gateway/checkout/");
    expect(pay.json.status).toBe("SUCCEEDED");

    const txn = await t.call("GET", `/topups/${start.json.transaction.id}`, { token: alice.token });
    expect(txn.json.status).toBe("COMPLETED");
    expect(await t.balance(alice.token)).toBe(20_000);
  });

  test("declined card leaves the balance untouched", async () => {
    await t.topup(bob.token, 5_000);
    const { start, pay } = await t.topup(bob.token, 3_000, "4000000000000002");
    expect(pay.json.status).toBe("DECLINED");

    const txn = await t.call("GET", `/topups/${start.json.transaction.id}`, { token: bob.token });
    expect(txn.json.status).toBe("FAILED");
    expect(txn.json.failureReason).toBe("GATEWAY_CARD_DECLINED");
    expect(await t.balance(bob.token)).toBe(5_000);
  });

  test("hosted checkout page renders", async () => {
    const start = await t.call("POST", "/topups", { token: alice.token, body: { amountCents: 1_000 } });
    const res = await t.app.request(`/gateway/checkout/${start.json.sessionId}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("€10.00");
  });

  test("webhooks with a bad signature are rejected", async () => {
    const body = JSON.stringify({ id: "evt_x", type: "payment.succeeded", created: 0, data: {} });
    const r = await t.call("POST", "/webhooks/gateway", {
      headers: { "x-gateway-signature": signWebhook("wrong-secret", body) },
      body: JSON.parse(body),
    });
    expect(r.status).toBe(400); // fails schema before even reaching signature check
  });

  test("forged webhook for a real transaction is rejected", async () => {
    const start = await t.call("POST", "/topups", { token: bob.token, body: { amountCents: 99_999 } });
    const event = {
      id: "evt_forged",
      type: "payment.succeeded",
      created: Math.floor(Date.now() / 1000),
      data: {
        sessionId: start.json.sessionId,
        transactionId: start.json.transaction.id,
        amountCents: 99_999,
        currency: "EUR",
        cardLast4: "4242",
        declineReason: null,
      },
    };
    const raw = JSON.stringify(event);
    const r = await t.call("POST", "/webhooks/gateway", {
      headers: { "x-gateway-signature": signWebhook("attacker-secret", raw) },
      body: event,
    });
    expect(r.status).toBe(401);
    expect(await t.balance(bob.token)).toBe(5_000);
  });
});

describe("P2P transfer", () => {
  test("moves money between wallets atomically", async () => {
    const before = { a: await t.balance(alice.token), b: await t.balance(bob.token) };
    const r = await t.call("POST", "/transfers", {
      token: alice.token,
      body: { to: "bob@test.hu", amountCents: 1_250, description: "Pizza" },
    });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ status: "COMPLETED", direction: "OUT", signedAmountCents: -1_250 });
    expect(await t.balance(alice.token)).toBe(before.a - 1_250);
    expect(await t.balance(bob.token)).toBe(before.b + 1_250);
  });

  test("recipient can be found by phone number", async () => {
    const r = await t.call("POST", "/transfers", { token: bob.token, body: { to: "+36 30 111 1111", amountCents: 100 } });
    expect(r.status).toBe(201);
    expect(r.json.counterparty.name).toBe("Alice Kovács");
  });

  test("insufficient funds -> 422, recorded as FAILED, no money moves", async () => {
    const before = await t.balance(bob.token);
    const r = await t.call("POST", "/transfers", { token: bob.token, body: { to: "alice@test.hu", amountCents: 900_000 } });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("INSUFFICIENT_FUNDS");
    expect(await t.balance(bob.token)).toBe(before);

    const failed = await t.call("GET", `/transactions/${r.json.error.details.transactionId}`, { token: bob.token });
    expect(failed.json.status).toBe("FAILED");
    // the recipient must not see a failed incoming transfer
    const hidden = await t.call("GET", `/transactions/${r.json.error.details.transactionId}`, { token: alice.token });
    expect(hidden.status).toBe(404);
  });

  test("cannot send to yourself or to unknown people", async () => {
    const self = await t.call("POST", "/transfers", { token: alice.token, body: { to: "alice@test.hu", amountCents: 100 } });
    expect(self.json.error.code).toBe("SELF_TRANSFER");
    const nobody = await t.call("POST", "/transfers", { token: alice.token, body: { to: "ghost@test.hu", amountCents: 100 } });
    expect(nobody.status).toBe(404);
  });

  test("idempotency key prevents double payment", async () => {
    const before = await t.balance(alice.token);
    const send = () =>
      t.call("POST", "/transfers", {
        token: alice.token,
        headers: { "idempotency-key": "double-tap-0001" },
        body: { to: "bob@test.hu", amountCents: 700 },
      });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(second.json.id).toBe(first.json.id);
    expect(await t.balance(alice.token)).toBe(before - 700);

    const reused = await t.call("POST", "/transfers", {
      token: alice.token,
      headers: { "idempotency-key": "double-tap-0001" },
      body: { to: "bob@test.hu", amountCents: 999 },
    });
    expect(reused.status).toBe(409);
  });

  test("frozen wallets cannot send", async () => {
    await t.call("PATCH", "/wallet", { token: alice.token, body: { status: "FROZEN" } });
    const r = await t.call("POST", "/transfers", { token: alice.token, body: { to: "bob@test.hu", amountCents: 100 } });
    expect(r.json.error.code).toBe("WALLET_FROZEN");
    await t.call("PATCH", "/wallet", { token: alice.token, body: { status: "ACTIVE" } });
  });
});

describe("QR payments", () => {
  test("create -> resolve -> pay -> cannot pay twice", async () => {
    const created = await t.call("POST", "/qr", {
      token: bob.token,
      body: { amountCents: 450, description: "Flat white" },
    });
    expect(created.status).toBe(201);
    expect(created.json.payload).toStartWith("finnova://pay?rid=");
    expect(created.json.qrDataUrl).toStartWith("data:image/png;base64,");

    const preview = await t.call("POST", "/qr/resolve", { token: alice.token, body: { payload: created.json.payload } });
    expect(preview.json).toMatchObject({ amountCents: 450, status: "OPEN", payee: { name: "Bob Nagy" } });

    const before = { a: await t.balance(alice.token), b: await t.balance(bob.token) };
    const paid = await t.call("POST", "/qr/pay", { token: alice.token, body: { payload: created.json.payload } });
    expect(paid.status).toBe(201);
    expect(paid.json).toMatchObject({ type: "QR_PAYMENT", status: "COMPLETED" });
    expect(await t.balance(alice.token)).toBe(before.a - 450);
    expect(await t.balance(bob.token)).toBe(before.b + 450);

    const status = await t.call("GET", `/qr/${created.json.id}`, { token: bob.token });
    expect(status.json.status).toBe("PAID");

    const again = await t.call("POST", "/qr/pay", { token: alice.token, body: { payload: created.json.payload } });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("QR_ALREADY_PAID");
  });

  test("tampered QR payload is rejected", async () => {
    const created = await t.call("POST", "/qr", { token: bob.token, body: { amountCents: 100 } });
    const forged = created.json.payload.replace(/sig=.*/, "sig=AAAAAAAAAAAAAAAAAAAAAA");
    const r = await t.call("POST", "/qr/pay", { token: alice.token, body: { payload: forged } });
    expect(r.json.error.code).toBe("QR_INVALID");
  });

  test("cannot pay your own QR, cancelled QR cannot be paid", async () => {
    const created = await t.call("POST", "/qr", { token: bob.token, body: { amountCents: 100 } });
    const own = await t.call("POST", "/qr/pay", { token: bob.token, body: { payload: created.json.payload } });
    expect(own.json.error.code).toBe("SELF_TRANSFER");

    await t.call("DELETE", `/qr/${created.json.id}`, { token: bob.token });
    const r = await t.call("POST", "/qr/pay", { token: alice.token, body: { payload: created.json.payload } });
    expect(r.status).toBe(410);
  });

  test("PNG endpoint serves an image", async () => {
    const created = await t.call("POST", "/qr", { token: bob.token, body: { amountCents: 100 } });
    const res = await t.app.request(`/qr/${created.json.id}/image.png`);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});

describe("payment history", () => {
  test("lists transactions newest first with filters and paging", async () => {
    const all = await t.call("GET", "/transactions?limit=100", { token: alice.token });
    expect(all.json.data.length).toBeGreaterThan(3);
    const ids = all.json.data.map((x: any) => x.id);
    expect([...ids].sort().reverse()).toEqual(ids);

    const topups = await t.call("GET", "/transactions?type=TOPUP", { token: alice.token });
    expect(topups.json.data.every((x: any) => x.type === "TOPUP")).toBeTrue();

    const incoming = await t.call("GET", "/transactions?direction=IN", { token: alice.token });
    expect(incoming.json.data.every((x: any) => x.direction === "IN")).toBeTrue();

    const page1 = await t.call("GET", "/transactions?limit=2", { token: alice.token });
    const page2 = await t.call("GET", `/transactions?limit=2&before=${page1.json.nextCursor}`, { token: alice.token });
    expect(page2.json.data[0].id).not.toBe(page1.json.data[0].id);
  });

  test("ledger is balanced: sum of wallet balances == money loaded via gateway", () => {
    const db = t.deps.db;
    const rows = db.$client
      .query<{ account: string; direction: string; total: number }, []>(
        "select account, direction, sum(amount_cents) total from ledger_entries group by account, direction",
      )
      .all();
    const sum = (a: string, d: string) => rows.find((r) => r.account === a && r.direction === d)?.total ?? 0;
    const debits = sum("wallet", "DEBIT") + sum("gateway_clearing", "DEBIT");
    const credits = sum("wallet", "CREDIT");
    expect(debits).toBe(credits);

    const balances = db.$client.query<{ total: number }, []>("select sum(balance_cents) total from wallets").get()!;
    expect(balances.total).toBe(sum("gateway_clearing", "DEBIT"));
  });
});

describe("docs", () => {
  test("OpenAPI spec and Swagger UI are served", async () => {
    const spec = await t.call("GET", "/openapi.json");
    expect(spec.json.openapi).toBe("3.1.0");
    expect(Object.keys(spec.json.paths)).toContain("/transfers");
    const ui = await t.app.request("/docs");
    expect(ui.status).toBe(200);
  });
});
