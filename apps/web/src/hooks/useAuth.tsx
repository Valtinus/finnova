import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setToken, setUnauthorizedHandler } from "../lib/api";
import type { Customer, Session, Wallet } from "../lib/types";

const STORAGE_KEY = "finnova.session";

interface AuthState {
  customer: Customer | null;
  wallet: Wallet | null;
  /** true while a stored session is being validated on first load */
  booting: boolean;
  login(email: string, password: string): Promise<void>;
  register(body: { email: string; password: string; fullName: string; phone?: string }): Promise<void>;
  logout(): void;
  /** re-fetch the wallet (balance, status) after any money movement */
  refreshWallet(): Promise<Wallet | null>;
  setWallet(wallet: Wallet): void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw) as Pick<Session, "token" | "expiresAt">;
    return new Date(expiresAt).getTime() > Date.now() ? token : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [booting, setBooting] = useState(() => readStoredToken() !== null);

  const clear = useCallback(() => {
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setCustomer(null);
    setWallet(null);
  }, []);

  const adopt = useCallback((session: Session) => {
    setToken(session.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt }));
    setCustomer(session.customer);
    setWallet(session.wallet);
  }, []);

  // Restore a previous session
  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) return;
    setToken(stored);
    api.auth
      .me()
      .then(({ customer, wallet }) => {
        setCustomer(customer);
        setWallet(wallet);
      })
      .catch(clear)
      .finally(() => setBooting(false));
  }, [clear]);

  // An expired/invalid token anywhere sends the user back to the login page
  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      customer,
      wallet,
      booting,
      login: async (email, password) => adopt(await api.auth.login(email, password)),
      register: async (body) => adopt(await api.auth.register(body)),
      logout: clear,
      refreshWallet: async () => {
        try {
          const fresh = await api.wallet.get();
          setWallet(fresh);
          return fresh;
        } catch {
          return null;
        }
      },
      setWallet,
    }),
    [customer, wallet, booting, adopt, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
