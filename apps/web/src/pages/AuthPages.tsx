import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { AuthBackdrop } from "../components/AuthBackdrop";
import { Alert, Spinner } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { errorMessage } from "../lib/api";

const DEMO = [
  { label: "Alice", email: "alice@finnova.test" },
  { label: "Bob", email: "bob@finnova.test" },
  { label: "Café (merchant)", email: "cafe@finnova.test" },
];
const DEMO_PASSWORD = "Password123!";

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="auth">
      <AuthBackdrop />
      <section className="auth-hero">
        <div className="logo">
          <div className="logo-mark">F</div>
          FinNova
        </div>
        <div>
          <h2>Money that moves as fast as you do.</h2>
          <p>Top up by card, send to friends in seconds and get paid with a QR code, all from one wallet.</p>
          <div className="hero-list">
            <div>
              <span className="ico"><Icon name="zap" size={18} /></span> Instant wallet-to-wallet transfers
            </div>
            <div>
              <span className="ico"><Icon name="qr" size={18} /></span> Request and pay with signed QR codes
            </div>
            <div>
              <span className="ico"><Icon name="shield" size={18} /></span> Idempotent, double-entry ledger
            </div>
          </div>
        </div>
        <p className="small" style={{ opacity: 0.55, marginTop: 0 }}>FinNova Bank · demo environment</p>
      </section>
      <section className="auth-form">
        <div className="card auth-card">
          <div>
            <h1>{title}</h1>
            <p className="muted" style={{ marginTop: 4 }}>{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: FormEvent, creds = { email, password }) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your FinNova wallet.">
      <form className="stack" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Spinner /> : "Sign in"}
        </button>
      </form>

      <div className="demo">
        <div className="small muted">Demo accounts (password <span className="mono">{DEMO_PASSWORD}</span>)</div>
        <div className="demo-btns">
          {DEMO.map((d) => (
            <button key={d.email} type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => submit(undefined, { email: d.email, password: DEMO_PASSWORD })}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <p className="center muted small">
        New to FinNova? <Link to="/register">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, phone: form.phone.trim() || undefined });
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="A EUR wallet is opened for you automatically.">
      <form className="stack" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" className="input" required minLength={2} maxLength={100} autoComplete="name" value={form.fullName} onChange={set("fullName")} placeholder="Dóra Szabó" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="dora@example.com" />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone <span className="faint">(optional, lets friends find you)</span></label>
          <input id="phone" className="input" type="tel" minLength={6} maxLength={20} autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="+36301234567" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Spinner /> : "Create account"}
        </button>
      </form>
      <p className="center muted small">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
