import { formatCents, parseAmountToCents } from "@finnova/shared";

export { formatCents, parseAmountToCents };

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const fullDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatFullDate = (iso: string) => fullDate.format(new Date(iso));

/** "Today" / "Yesterday" / "Monday 13 October", used for history group headers. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return dateOnly.format(d);
}

/** Money with an explicit sign: "+€12.50" / "-€12.50". */
export function signedMoney(cents: number): string {
  const abs = formatCents(Math.abs(cents));
  return cents < 0 ? `-${abs}` : `+${abs}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Remaining time like "12:30" for a countdown. */
export function countdown(expiresAt: string, now: number): string {
  const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const FAILURE_TEXT: Record<string, string> = {
  GATEWAY_CARD_DECLINED: "Your card was declined",
  GATEWAY_INSUFFICIENT_FUNDS: "Insufficient funds on the card",
  GATEWAY_EXPIRED_CARD: "The card has expired",
  INSUFFICIENT_FUNDS: "Insufficient wallet balance",
};

export const failureText = (reason: string | null) =>
  reason ? (FAILURE_TEXT[reason] ?? reason.replace(/^GATEWAY_/, "").replace(/_/g, " ").toLowerCase()) : null;

export const newIdempotencyKey = () => crypto.randomUUID();
