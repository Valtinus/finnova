/** Prefixed, sortable ids: cus_..., wal_..., txn_... (UUIDv7 under the hood). */
export function newId(prefix: "cus" | "wal" | "txn" | "led" | "qr" | "gws"): string {
  return `${prefix}_${Bun.randomUUIDv7().replaceAll("-", "")}`;
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Human-friendly payment reference, e.g. FN-7K2P9QXA */
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return `FN-${out}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
