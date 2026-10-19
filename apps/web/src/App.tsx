import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { GuestOnly, RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./hooks/useAuth";
import { ToastProvider } from "./hooks/useToast";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Receive } from "./pages/Receive";
import { Scan } from "./pages/Scan";
import { Send } from "./pages/Send";
import { TopUp } from "./pages/TopUp";
import { WalletPage } from "./pages/WalletPage";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="topup" element={<TopUp />} />
                <Route path="send" element={<Send />} />
                <Route path="receive" element={<Receive />} />
                <Route path="scan" element={<Scan />} />
                <Route path="history" element={<History />} />
                <Route path="wallet" element={<WalletPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
