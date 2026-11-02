// The DApp shares FinNova's design system with the web app instead of copying it.
// Everything it uses from apps/web goes through this one module.
import "../../web/src/styles/index.css";

export { AuthBackdrop } from "../../web/src/components/AuthBackdrop";
export { Icon, type IconName } from "../../web/src/components/Icon";
export { ThemeToggle } from "../../web/src/components/ThemeToggle";
export { Alert, EmptyState, Modal, PageSpinner, Skeleton, Spinner } from "../../web/src/components/ui";
export { ToastProvider, useToast } from "../../web/src/hooks/useToast";
export { dayLabel, formatDateTime, formatFullDate } from "../../web/src/lib/format";
