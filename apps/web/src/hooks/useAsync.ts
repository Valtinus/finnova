import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { errorMessage } from "../lib/api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload(): void;
}

/** Run an async loader on mount / when deps change. Stale responses are ignored. */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const run = ++latest.current;
    setLoading(true);
    loader()
      .then((result) => {
        if (run !== latest.current) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (run === latest.current) setError(errorMessage(err));
      })
      .finally(() => {
        if (run === latest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
