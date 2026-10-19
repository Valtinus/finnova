import { formatCents } from "@finnova/shared";

export { formatCents };

/** alice@finnova.test -> al***@finnova.test */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

export function signedFormat(cents: number): string {
  return cents < 0 ? `-${formatCents(-cents)}` : `+${formatCents(cents)}`;
}
