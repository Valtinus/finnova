import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PageSpinner } from "./ui";

/** Route guard: only signed-in customers get through. */
export function RequireAuth() {
  const { customer, booting } = useAuth();
  const location = useLocation();
  if (booting) return <PageSpinner />;
  if (!customer) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Login/register pages bounce signed-in customers to the dashboard. */
export function GuestOnly() {
  const { customer, booting } = useAuth();
  if (booting) return <PageSpinner />;
  if (customer) return <Navigate to="/" replace />;
  return <Outlet />;
}
