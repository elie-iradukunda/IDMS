import { useEffect, useState } from 'react';

// Returns `value` only once it has stopped changing for `delay` ms.
//
// Search boxes here filter server-side against the whole district, so a
// request per keystroke means eight queries to type "Mukamana" — on a rural
// office connection the answers then arrive out of order and the list flickers
// between results. Debouncing the term (not the request) fixes both.
export function useDebounced(value, delay = 350) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}
