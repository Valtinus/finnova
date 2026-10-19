import { useTheme } from "../hooks/useTheme";
import { Icon } from "./Icon";

export function ThemeToggle({ label = false }: { label?: boolean }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="btn btn-ghost" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
      {label && (theme === "dark" ? "Light mode" : "Dark mode")}
    </button>
  );
}
