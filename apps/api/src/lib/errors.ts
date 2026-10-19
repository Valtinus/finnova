import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "INSUFFICIENT_FUNDS"
  | "WALLET_FROZEN"
  | "SELF_TRANSFER"
  | "LIMIT_EXCEEDED"
  | "QR_INVALID"
  | "QR_EXPIRED"
  | "QR_ALREADY_PAID"
  | "GATEWAY_ERROR"
  | "INVALID_SIGNATURE"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

/** Domain error thrown by services, rendered as { error: { code, message } }. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found`);
