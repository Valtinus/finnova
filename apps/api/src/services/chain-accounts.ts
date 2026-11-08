import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { getAddress, isAddress, verifyMessage } from "ethers";
import type { AppConfig } from "../config";
import type { DB } from "../db/client";
import { chainAccounts, customers, type ChainAccount, type Customer } from "../db/schema";
import { AppError } from "../lib/errors";
import { maskEmail } from "../lib/format";
import { nowIso } from "../lib/ids";
import { findCustomerByIdentifier, getCustomer } from "./customers";

/**
 * Linking a blockchain wallet (e.g. MetaMask) to a FinNova account.
 *
 * 1. The customer asks for a challenge for an address. The API builds a message that names the
 *    customer, the address, the time and a nonce. The nonce is an HMAC of those three under a
 *    server secret, so nobody else can produce a valid message, and nothing has to be stored.
 * 2. The customer signs the message in their wallet (personal_sign, no transaction, no gas).
 * 3. The API rebuilds the same message, recovers the signer from the signature and links the
 *    address only if the signer is that address and the challenge has not expired.
 */

/** 0x + 40 hex digits, with a valid EIP-55 checksum if it is mixed case. */
export const isEthAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value) && isAddress(value);

export function toChainAccountDto(a: ChainAccount) {
  return { address: a.address, linkedAt: a.linkedAt };
}

function nonce(config: AppConfig, customerId: string, address: string, issuedAt: string) {
  return createHmac("sha256", config.walletLinkSecret)
    .update(`${customerId}|${address}|${issuedAt}`)
    .digest("hex")
    .slice(0, 16);
}

/** The exact text the customer signs. Rebuilt from the same inputs when the signature comes back. */
export function linkMessage(config: AppConfig, customer: Customer, address: string, issuedAt: string) {
  return [
    "FinNova Bank: link this wallet to your account",
    "",
    `Customer: ${customer.fullName} (${customer.email})`,
    `Wallet: ${address}`,
    `Issued at: ${issuedAt}`,
    `Nonce: ${nonce(config, customer.id, address, issuedAt)}`,
    "",
    "Signing proves that you own this wallet. It is free and sends no transaction.",
  ].join("\n");
}

export function createLinkChallenge(db: DB, config: AppConfig, customerId: string, rawAddress: string) {
  const customer = getCustomer(db, customerId);
  const address = getAddress(rawAddress);
  const issuedAt = nowIso();
  const expiresAt = new Date(Date.parse(issuedAt) + config.walletLinkTtlSeconds * 1000).toISOString();
  return { address, issuedAt, expiresAt, message: linkMessage(config, customer, address, issuedAt) };
}

export function getChainAccount(db: DB, customerId: string) {
  return db.select().from(chainAccounts).where(eq(chainAccounts.customerId, customerId)).get() ?? null;
}

export function linkChainAccount(
  db: DB,
  config: AppConfig,
  customerId: string,
  input: { address: string; issuedAt: string; signature: string },
) {
  const customer = getCustomer(db, customerId);
  const address = getAddress(input.address);

  const issued = Date.parse(input.issuedAt);
  if (Number.isNaN(issued)) throw new AppError(400, "VALIDATION_ERROR", "issuedAt is not a valid timestamp");
  if (Date.now() > issued + config.walletLinkTtlSeconds * 1000) {
    throw new AppError(400, "LINK_EXPIRED", "This link request has expired. Start again and sign the new message.");
  }

  // Any change to the address, the time or the customer changes the message, so the signature no longer matches
  let signer: string;
  try {
    signer = verifyMessage(linkMessage(config, customer, address, input.issuedAt), input.signature);
  } catch {
    throw new AppError(400, "INVALID_SIGNATURE", "The signature could not be read");
  }
  if (signer !== address) {
    throw new AppError(400, "INVALID_SIGNATURE", "The message was not signed by this wallet");
  }

  return db.transaction((tx) => {
    const owner = tx.select().from(chainAccounts).where(eq(chainAccounts.addressKey, address.toLowerCase())).get();
    if (owner && owner.customerId !== customerId) {
      throw new AppError(409, "CONFLICT", "This wallet is already linked to another FinNova account");
    }
    const linkedAt = nowIso();
    return tx
      .insert(chainAccounts)
      .values({ customerId, address, addressKey: address.toLowerCase(), linkedAt })
      .onConflictDoUpdate({ target: chainAccounts.customerId, set: { address, addressKey: address.toLowerCase(), linkedAt } })
      .returning()
      .get();
  });
}

export function unlinkChainAccount(db: DB, customerId: string) {
  db.delete(chainAccounts).where(eq(chainAccounts.customerId, customerId)).run();
}

/** A FinNova customer and their linked wallet, by email, phone, customer id or wallet address. */
export function lookupChainParty(db: DB, query: string) {
  const q = query.trim();
  let customer: Customer | null;
  let account: ChainAccount | null;

  if (isEthAddress(q)) {
    account = db.select().from(chainAccounts).where(eq(chainAccounts.addressKey, q.toLowerCase())).get() ?? null;
    customer = account ? (db.select().from(customers).where(eq(customers.id, account.customerId)).get() ?? null) : null;
    if (!account || !customer) throw new AppError(404, "NOT_FOUND", "No FinNova customer has linked this address");
  } else {
    customer = findCustomerByIdentifier(db, q);
    if (!customer) throw new AppError(404, "NOT_FOUND", "No FinNova customer with that email or phone");
    account = getChainAccount(db, customer.id);
    if (!account) throw new AppError(404, "NOT_FOUND", `${customer.fullName} has not linked a blockchain wallet yet`);
  }

  return { customerId: customer.id, name: customer.fullName, email: maskEmail(customer.email), address: account.address };
}
