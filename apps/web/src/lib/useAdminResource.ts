"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The load → render → mutate → reload cycle every dashboard section runs.
 * Each section used to hand-roll its own `load()`, `busy` flag and swallowed
 * catch; this keeps one copy with real error surfacing.
 *
 * @param loader fetch for this section, re-run whenever `refreshKey` changes
 * @param refreshKey the dashboard's refresh counter, or a string mixing in any
 *   local input the fetch depends on (e.g. a mailbox filter)
 */
export function useAdminResource<T>(
  loader: () => Promise<T>,
  refreshKey: number | string,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Key of the row currently mutating, so only that control shows a spinner. */
  const [busy, setBusy] = useState<string | null>(null);

  // Sections pass an inline arrow; keep the latest without re-running on identity.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      setData(await loaderRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  /** Run a mutation, then refresh. Returns true when it succeeded. */
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
        await reload();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  return { data, loading, error, busy, setError, reload, run };
}
