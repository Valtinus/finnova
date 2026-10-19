import { CURRENCY } from "./domain";

/**
 * All money is stored and transported as integer minor units (cents).
 * Never use floating point for balances.
 */

/** 1250 -> "€12.50" */
export function formatCents(cents: number, currency: string = CURRENCY, locale = "en-IE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/**
 * Parse user input like "12", "12.5", "12,50" into cents.
 * Returns null for invalid input or more than 2 decimals.
 */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
