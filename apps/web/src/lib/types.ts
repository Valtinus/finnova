import type {
  Direction,
  PaymentRailId,
  QrRequestStatus,
  TransactionStatus,
  TransactionType,
  WalletStatus,
} from "@finnova/shared";

/** Response shapes of the FinNova API (see apps/api/src/schemas.ts). */

export interface Customer {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  customerId: string;
  currency: "EUR";
  balanceCents: number;
  balanceFormatted: string;
  status: WalletStatus;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  customer: Customer;
  wallet: Wallet | null;
}

export interface Party {
  customerId: string | null;
  name: string;
  email: string | null;
}

export interface Transaction {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  rail: PaymentRailId;
  direction: Direction;
  amountCents: number;
  signedAmountCents: number;
  amountFormatted: string;
  currency: string;
  description: string | null;
  counterparty: Party | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TransactionPage {
  data: Transaction[];
  nextCursor: string | null;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  direction: "DEBIT" | "CREDIT";
  amountCents: number;
  balanceAfterCents: number | null;
  createdAt: string;
}

export interface QrRequest {
  id: string;
  amountCents: number;
  amountFormatted: string;
  currency: string;
  description: string | null;
  status: QrRequestStatus;
  payee: Party;
  expiresAt: string;
  createdAt: string;
  paidByTransactionId: string | null;
}

export interface QrRequestWithImage extends QrRequest {
  payload: string;
  qrDataUrl: string;
}

export interface Topup {
  transaction: Transaction;
  sessionId: string | null;
  checkoutUrl: string | null;
}

export interface TransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  direction?: Direction;
  limit?: number;
  before?: string;
}
