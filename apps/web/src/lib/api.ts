import type {
  Customer,
  LedgerEntry,
  Party,
  QrRequest,
  QrRequestWithImage,
  Session,
  Topup,
  Transaction,
  TransactionFilters,
  TransactionPage,
  Wallet,
} from "./types";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

/** The API always answers errors as { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string | null) {
  token = value;
}

/** Called when a request with a token comes back 401 (expired session). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the FinNova API. Is it running?");
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = payload?.error;
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? res.statusText, err?.details);
  }
  return payload as T;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<Session>("/auth/login", { method: "POST", body: { email, password } }),
    register: (body: { email: string; password: string; fullName: string; phone?: string }) =>
      request<Session>("/auth/register", { method: "POST", body }),
    me: () => request<{ customer: Customer; wallet: Wallet | null }>("/auth/me"),
  },
  wallet: {
    get: () => request<Wallet>("/wallet"),
    update: (body: { nickname?: string | null; status?: Wallet["status"] }) =>
      request<Wallet>("/wallet", { method: "PATCH", body }),
    ledger: (limit = 50, before?: string) =>
      request<{ data: LedgerEntry[] }>("/wallet/ledger", { query: { limit, before } }),
  },
  customers: {
    lookup: (q: string) => request<Party>("/customers/lookup", { query: { q } }),
  },
  transfers: {
    create: (body: { to: string; amountCents: number; description?: string }, idempotencyKey: string) =>
      request<Transaction>("/transfers", { method: "POST", body, idempotencyKey }),
  },
  topups: {
    create: (body: { amountCents: number; returnUrl?: string }, idempotencyKey: string) =>
      request<Topup>("/topups", { method: "POST", body, idempotencyKey }),
    get: (id: string) => request<Transaction>(`/topups/${id}`),
  },
  qr: {
    create: (body: { amountCents: number; description?: string; expiresInSeconds?: number }) =>
      request<QrRequestWithImage>("/qr", { method: "POST", body }),
    list: (status?: QrRequest["status"]) => request<{ data: QrRequest[] }>("/qr", { query: { status } }),
    get: (id: string) => request<QrRequestWithImage>(`/qr/${id}`),
    cancel: (id: string) => request<QrRequest>(`/qr/${id}`, { method: "DELETE" }),
    resolve: (payload: string) => request<QrRequest>("/qr/resolve", { method: "POST", body: { payload } }),
    pay: (payload: string, idempotencyKey: string) =>
      request<Transaction>("/qr/pay", { method: "POST", body: { payload }, idempotencyKey }),
  },
  transactions: {
    list: (filters: TransactionFilters = {}) =>
      request<TransactionPage>("/transactions", { query: { ...filters } }),
    get: (id: string) => request<Transaction>(`/transactions/${id}`),
  },
};

/** Human-friendly message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "VALIDATION_ERROR" && Array.isArray(err.details) && err.details[0]) {
      const first = err.details[0] as { path?: string; message?: string };
      return first.path ? `${first.path}: ${first.message}` : (first.message ?? err.message);
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
