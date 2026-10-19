import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { customers, type Customer } from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { createWallet } from "./wallets";

export function toCustomerDto(c: Customer) {
  return { id: c.id, email: c.email, phone: c.phone, fullName: c.fullName, createdAt: c.createdAt };
}

export function normalizePhone(phone: string) {
  return phone.replace(/[\s\-()]/g, "");
}

export async function registerCustomer(
  db: DB,
  input: { email: string; password: string; fullName: string; phone?: string | null },
) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone ? normalizePhone(input.phone) : null;

  if (db.select().from(customers).where(eq(customers.email, email)).get()) {
    throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }
  if (phone && db.select().from(customers).where(eq(customers.phone, phone)).get()) {
    throw new AppError(409, "CONFLICT", "An account with this phone number already exists");
  }

  const passwordHash = await Bun.password.hash(input.password); // argon2id

  return db.transaction((tx) => {
    const customer = tx
      .insert(customers)
      .values({ id: newId("cus"), email, phone, fullName: input.fullName.trim(), passwordHash })
      .returning()
      .get();
    const wallet = createWallet(tx, customer.id);
    return { customer, wallet };
  });
}

export async function authenticate(db: DB, email: string, password: string) {
  const customer = db
    .select()
    .from(customers)
    .where(eq(customers.email, email.trim().toLowerCase()))
    .get();
  const ok = customer ? await Bun.password.verify(password, customer.passwordHash) : false;
  if (!customer || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  return customer;
}

export function getCustomer(db: DB, id: string) {
  const c = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!c) throw notFound("Customer");
  return c;
}

/** Find a customer by email, phone number or customer id. */
export function findCustomerByIdentifier(db: DB, identifier: string) {
  const q = identifier.trim();
  if (q.startsWith("cus_")) return db.select().from(customers).where(eq(customers.id, q)).get() ?? null;
  if (q.includes("@")) {
    return db.select().from(customers).where(eq(customers.email, q.toLowerCase())).get() ?? null;
  }
  return db.select().from(customers).where(eq(customers.phone, normalizePhone(q))).get() ?? null;
}
