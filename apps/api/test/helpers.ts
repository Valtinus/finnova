import { createApp } from "../src/app";

/** Fresh app with an in-memory database per test file. */
export function setup() {
  const { app, deps } = createApp({ config: { databasePath: ":memory:" }, quiet: true });

  async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, headers: res.headers, json };
  }

  async function register(name: string, email: string, phone?: string) {
    const r = await call("POST", "/auth/register", {
      body: { email, password: "Password123!", fullName: name, phone },
    });
    if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.json)}`);
    return r.json as { token: string; customer: { id: string }; wallet: { id: string } };
  }

  /** Top up through the mock gateway with a given test card. */
  async function topup(token: string, amountCents: number, card = "4242424242424242") {
    const start = await call("POST", "/topups", { token, body: { amountCents } });
    const pay = await call("POST", `/gateway/sessions/${start.json.sessionId}/pay`, {
      body: { number: card, expMonth: 12, expYear: 2099, cvc: "123" },
    });
    return { start, pay };
  }

  async function balance(token: string) {
    return (await call("GET", "/wallet", { token })).json.balanceCents as number;
  }

  return { app, deps, call, register, topup, balance };
}
