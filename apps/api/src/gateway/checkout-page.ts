import { html, raw } from "hono/html";
import type { GatewaySession } from "../db/schema";
import { formatCents } from "../lib/format";
import { TEST_CARDS } from "./mock-gateway";

/** Hosted checkout page of the mock gateway (what the customer sees after "Top up"). */
export function checkoutPage(session: GatewaySession) {
  const amount = formatCents(session.amountCents, session.currency);
  const open = session.status === "OPEN";

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PayGate · Checkout</title>
<style>
  :root { --bg:#f4f5f7; --card:#fff; --ink:#14171f; --muted:#667085; --line:#e4e7ec; --accent:#3b5bfd; --ok:#12b76a; --bad:#f04438; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg);
         font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); padding:16px; }
  .card { width:100%; max-width:400px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px;
          box-shadow:0 12px 40px rgba(16,24,40,.08); }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; letter-spacing:.2px; }
  .brand span { font-size:11px; font-weight:600; color:var(--accent); background:#eef1ff; padding:2px 8px; border-radius:99px; }
  .merchant { margin-top:20px; color:var(--muted); font-size:13px; }
  .amount { font-size:34px; font-weight:700; margin:2px 0 20px; font-variant-numeric:tabular-nums; }
  label { display:block; font-size:13px; color:var(--muted); margin:12px 0 6px; }
  input { width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:10px; font:inherit; font-variant-numeric:tabular-nums; }
  input:focus { outline:2px solid #c7d2fe; border-color:var(--accent); }
  .row { display:flex; gap:10px; } .row > div { flex:1; }
  button { width:100%; margin-top:20px; padding:13px; border:0; border-radius:10px; background:var(--accent); color:#fff; font:600 15px system-ui; cursor:pointer; }
  button:disabled { opacity:.6; cursor:wait; }
  .hint { margin-top:18px; font-size:12px; color:var(--muted); background:#f9fafb; border:1px dashed var(--line); border-radius:10px; padding:10px 12px; }
  .hint code { font-size:12px; }
  .result { text-align:center; padding:12px 0 4px; }
  .result .icon { font-size:44px; }
  .ok { color:var(--ok); } .bad { color:var(--bad); }
  .err { color:var(--bad); font-size:13px; margin-top:10px; min-height:1em; }
</style>
</head>
<body>
<main class="card">
  <div class="brand">PayGate <span>TEST MODE</span></div>
  <div class="merchant">Pay to FinNova Bank · wallet top-up</div>
  <div class="amount">${amount}</div>

  ${open
    ? html`<form id="f" autocomplete="off">
    <label for="number">Card number</label>
    <input id="number" inputmode="numeric" value="4242 4242 4242 4242" required />
    <div class="row">
      <div><label for="exp">Expiry (MM/YY)</label><input id="exp" value="12/30" required /></div>
      <div><label for="cvc">CVC</label><input id="cvc" inputmode="numeric" value="123" required /></div>
    </div>
    <button id="btn" type="submit">Pay ${amount}</button>
    <div class="err" id="err"></div>
  </form>
  <div class="hint">
    Test cards:<br/>
    <code>${TEST_CARDS.success}</code> success<br/>
    <code>${TEST_CARDS.declined}</code> declined<br/>
    <code>${TEST_CARDS.insufficientFunds}</code> insufficient funds
  </div>`
    : html`<div class="result">
    <div class="icon ${session.status === "SUCCEEDED" ? "ok" : "bad"}">${session.status === "SUCCEEDED" ? "✓" : "✕"}</div>
    <p>This checkout is <strong>${session.status.toLowerCase()}</strong>.</p>
  </div>`}
</main>
${open
  ? raw(`<script>
  const f = document.getElementById("f");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn"), err = document.getElementById("err");
    btn.disabled = true; btn.textContent = "Processing…"; err.textContent = "";
    const [mm, yy] = document.getElementById("exp").value.split("/").map(s => parseInt(s, 10));
    const res = await fetch(${JSON.stringify(`../sessions/${session.id}/pay`)}, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        number: document.getElementById("number").value,
        expMonth: mm, expYear: yy < 100 ? 2000 + yy : yy,
        cvc: document.getElementById("cvc").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error?.message ?? "Something went wrong"; btn.disabled = false; btn.textContent = "Try again"; return; }
    const ok = data.status === "SUCCEEDED";
    document.querySelector(".card").innerHTML =
      '<div class="brand">PayGate <span>TEST MODE</span></div>' +
      '<div class="result"><div class="icon ' + (ok ? "ok" : "bad") + '">' + (ok ? "✓" : "✕") + '</div>' +
      '<h2>' + (ok ? "Payment successful" : "Payment declined") + '</h2>' +
      '<p style="color:#667085">' + (ok ? "Your FinNova wallet has been topped up." : "Reason: " + data.declineReason) + '</p>' +
      (data.returnUrl ? '<p style="color:#667085;font-size:13px">Returning to FinNova…</p>' : '') + '</div>';
    if (data.returnUrl) setTimeout(() => location.href = data.returnUrl, 1800);
  });
</script>`)
  : ""}
</body>
</html>`;
}
