import { useEffect, useState, useCallback } from 'react';
import { get } from './api.js';

// Minimal data-fetching hook: fetches `path` on mount and whenever it
// changes, and exposes reload() for after a mutation. `data`, `loading`
// and `error` drive the standard loading / error / empty UI in every page.
export function useFetch(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    get(path)
      .then((d) => alive && (setData(d), setLoading(false)))
      .catch((e) => alive && (setError(e), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, loading, error, reload, setData };
}
