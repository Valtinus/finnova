import { afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { Wallet } from "ethers";
import { setup } from "./helpers";

const t = setup();
let alice: Awaited<ReturnType<typeof t.register>>;
let bob: Awaited<ReturnType<typeof t.register>>;

// Throwaway keys: the API only ever sees addresses and signatures
const aliceKey = Wallet.createRandom();
const bobKey = Wallet.createRandom();

beforeAll(async () => {
  alice = await t.register("Alice Kovács", "alice@chain.hu", "+36305555555");
  bob = await t.register("Bob Nagy", "bob@chain.hu");
  await t.register("Carol Szabó", "carol@chain.hu"); // never links a wallet
});

afterEach(() => setSystemTime()); // back to the real clock

/** Ask for the message to sign, sign it with `signer`, and link `address` (defaults to the signer's). */
async function link(token: string, signer: { address: string; signMessage(m: string): Promise<string> }, address = signer.address) {
  const challenge = await t.call("POST", "/blockchain/account/challenge", { token, body: { address } });
  expect(challenge.status).toBe(200);
  const signature = await signer.signMessage(challenge.json.message);
  return t.call("PUT", "/blockchain/account", {
    token,
    body: { address, issuedAt: challenge.json.issuedAt, signature },
  });
}

describe("linking a blockchain wallet", () => {
  test("needs a token", async () => {
    expect((await t.call("GET", "/blockchain/account")).status).toBe(401);
  });

  test("a new customer has no linked wallet", async () => {
    const r = await t.call("GET", "/blockchain/account", { token: alice.token });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ account: null });
  });

  test("the challenge names the customer and the address, and expires", async () => {
    const r = await t.call("POST", "/blockchain/account/challenge", {
      token: alice.token,
      body: { address: aliceKey.address.toLowerCase() },
    });
    expect(r.status).toBe(200);
    expect(r.json.address).toBe(aliceKey.address); // checksummed
    expect(r.json.message).toContain("alice@chain.hu");
    expect(r.json.message).toContain(aliceKey.address);
    expect(Date.parse(r.json.expiresAt)).toBeGreaterThan(Date.parse(r.json.issuedAt));
  });

  test("rejects an invalid address", async () => {
    const r = await t.call("POST", "/blockchain/account/challenge", { token: alice.token, body: { address: "0x123" } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("VALIDATION_ERROR");
  });

  test("a signature from another key is rejected", async () => {
    const r = await link(alice.token, bobKey, aliceKey.address);
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_SIGNATURE");
    expect((await t.call("GET", "/blockchain/account", { token: alice.token })).json.account).toBeNull();
  });

  test("a tampered issuedAt is rejected (the message no longer matches)", async () => {
    const challenge = await t.call("POST", "/blockchain/account/challenge", {
      token: alice.token,
      body: { address: aliceKey.address },
    });
    const signature = await aliceKey.signMessage(challenge.json.message);
    const later = new Date(Date.parse(challenge.json.issuedAt) + 1000).toISOString();
    const r = await t.call("PUT", "/blockchain/account", {
      token: alice.token,
      body: { address: aliceKey.address, issuedAt: later, signature },
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_SIGNATURE");
  });

  test("an expired challenge is rejected", async () => {
    const challenge = await t.call("POST", "/blockchain/account/challenge", {
      token: alice.token,
      body: { address: aliceKey.address },
    });
    const signature = await aliceKey.signMessage(challenge.json.message);
    setSystemTime(new Date(Date.parse(challenge.json.expiresAt) + 1000));
    const r = await t.call("PUT", "/blockchain/account", {
      token: alice.token,
      body: { address: aliceKey.address, issuedAt: challenge.json.issuedAt, signature },
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("LINK_EXPIRED");
  });

  test("a signed challenge links the wallet", async () => {
    const r = await link(alice.token, aliceKey);
    expect(r.status).toBe(200);
    expect(r.json.address).toBe(aliceKey.address);
    expect(r.json.linkedAt).toBeString();

    const me = await t.call("GET", "/blockchain/account", { token: alice.token });
    expect(me.json.account.address).toBe(aliceKey.address);
  });

  test("a challenge signed for one customer cannot link another", async () => {
    // Bob replays Alice's signed challenge: the message names Alice, so it does not match his
    const challenge = await t.call("POST", "/blockchain/account/challenge", {
      token: alice.token,
      body: { address: aliceKey.address },
    });
    const signature = await aliceKey.signMessage(challenge.json.message);
    const r = await t.call("PUT", "/blockchain/account", {
      token: bob.token,
      body: { address: aliceKey.address, issuedAt: challenge.json.issuedAt, signature },
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_SIGNATURE");
  });

  test("one wallet belongs to one customer", async () => {
    // aliceKey is Alice's; even with a valid signature Bob cannot take it over
    const r = await link(bob.token, aliceKey);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("CONFLICT");
  });

  test("linking another wallet replaces the old one", async () => {
    const other = Wallet.createRandom();
    expect((await link(alice.token, other)).status).toBe(200);
    expect((await t.call("GET", "/blockchain/account", { token: alice.token })).json.account.address).toBe(other.address);

    // ...and frees the old address for someone else
    expect((await link(alice.token, aliceKey)).status).toBe(200);
    expect((await link(bob.token, other)).status).toBe(200);
    expect((await link(bob.token, bobKey)).status).toBe(200);
  });

  test("unlinking removes the wallet", async () => {
    const tmp = await t.register("Temp User", "temp@chain.hu");
    await link(tmp.token, Wallet.createRandom());
    const r = await t.call("DELETE", "/blockchain/account", { token: tmp.token });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ account: null });
    expect((await t.call("GET", "/blockchain/account", { token: tmp.token })).json.account).toBeNull();
  });
});

describe("finding a customer's wallet", () => {
  test("by email or phone", async () => {
    const byEmail = await t.call("GET", "/blockchain/lookup?q=bob@chain.hu", { token: alice.token });
    expect(byEmail.status).toBe(200);
    expect(byEmail.json).toMatchObject({ customerId: bob.customer.id, name: "Bob Nagy", address: bobKey.address });
    expect(byEmail.json.email).not.toBe("bob@chain.hu"); // masked like /customers/lookup

    const byPhone = await t.call("GET", `/blockchain/lookup?q=${encodeURIComponent("+36 30 555 5555")}`, { token: bob.token });
    expect(byPhone.json).toMatchObject({ name: "Alice Kovács", address: aliceKey.address });
  });

  test("by address, in any letter case", async () => {
    const r = await t.call("GET", `/blockchain/lookup?q=${aliceKey.address.toLowerCase()}`, { token: bob.token });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ customerId: alice.customer.id, name: "Alice Kovács", address: aliceKey.address });
  });

  test("a customer without a linked wallet is reported as such", async () => {
    const r = await t.call("GET", "/blockchain/lookup?q=carol@chain.hu", { token: alice.token });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("NOT_FOUND");
    expect(r.json.error.message).toContain("Carol Szabó");
  });

  test("unknown customers and addresses are not found", async () => {
    expect((await t.call("GET", "/blockchain/lookup?q=nobody@chain.hu", { token: alice.token })).status).toBe(404);
    expect((await t.call("GET", `/blockchain/lookup?q=${Wallet.createRandom().address}`, { token: alice.token })).status).toBe(404);
  });

  test("lookup needs a token", async () => {
    expect((await t.call("GET", "/blockchain/lookup?q=bob@chain.hu")).status).toBe(401);
  });
});
