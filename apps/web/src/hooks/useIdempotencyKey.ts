import { useCallback, useRef } from "react";
import { newIdempotencyKey } from "../lib/format";

/**
 * One Idempotency-Key per payment attempt.
 * Keep it while a request may still be in flight / was lost (network error) so a retry can't pay twice,
 * and call `renew()` once the API gave a definitive answer so the next attempt is a fresh payment.
 */
export function useIdempotencyKey() {
  const ref = useRef(newIdempotencyKey());
  const current = useCallback(() => ref.current, []);
  const renew = useCallback(() => {
    ref.current = newIdempotencyKey();
  }, []);
  return { current, renew };
}
