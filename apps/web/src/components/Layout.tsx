import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar } from "./ui";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/send", label: "Send", icon: "send" },
  { to: "/receive", label: "Receive", icon: "qr" },
  { to: "/scan", label: "Scan & pay", icon: "scan" },
  { to: "/topup", label: "Top up", icon: "plus" },
  { to: "/history", label: "Activity", icon: "history" },
  { to: "/wallet", label: "Wallet", icon: "wallet" },
];

const MOBILE_NAV: { to: string; label: string; icon: IconName; end?: boolean; fab?: boolean }[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/send", label: "Send", icon: "send" },
  { to: "/scan", label: "Scan", icon: "scan", fab: true },
  { to: "/history", label: "Activity", icon: "history" },
  { to: "/wallet", label: "Wallet", icon: "wallet" },
];

function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark">F</div>
      FinNova
    </div>
  );
}

export function Layout() {
  const { customer, logout } = useAuth();

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <Logo />
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="user-chip">
              <Avatar name={customer?.fullName ?? ""} />
              <div className="grow">
                <div className="name">{customer?.fullName}</div>
                <div className="email">{customer?.email}</div>
              </div>
            </div>
            <ThemeToggle label />
            <button className="btn btn-ghost" onClick={logout}>
              <Icon name="logout" size={18} /> Sign out
            </button>
          </div>
        </aside>

        <div>
          <div className="mobile-top">
            <Logo />
            <div className="row" style={{ gap: 0 }}>
              <ThemeToggle />
              <button className="btn btn-ghost" onClick={logout} aria-label="Sign out">
                <Icon name="logout" size={20} />
              </button>
            </div>
          </div>
          <main className="main">
            <Outlet />
          </main>
        </div>

        <nav className="bottom-nav" aria-label="Main">
          {MOBILE_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={item.fab ? "scan" : undefined}>
              {item.fab ? (
                <span className="fab">
                  <Icon name={item.icon} size={22} />
                </span>
              ) : (
                <Icon name={item.icon} size={22} />
              )}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}
