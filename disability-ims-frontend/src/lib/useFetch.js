import { useEffect, useState, useCallback } from 'react';
import { get, getList } from './api.js';

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

// Same contract as useFetch, plus `total` — the number of rows that match the
// query across the whole table, not just the page that came back. A list that
// shows "25 records" when the search actually found 2,431 tells the officer
// their search was narrow when it was not.
export function usePagedFetch(path) {
  const [data, setData] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    getList(path)
      .then(({ rows, total: n }) => {
        if (!alive) return;
        setData(rows);
        setTotal(n);
        setLoading(false);
      })
      .catch((e) => alive && (setError(e), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, total, loading, error, reload, setData };
}
