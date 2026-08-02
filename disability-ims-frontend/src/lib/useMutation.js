import { useState, useCallback } from 'react';
import { useUI } from '../context/UIContext.jsx';

// Every write in the app follows the same shape: disable the control,
// call the API, show the server's message on failure, toast on success,
// reload the list. Repeating that by hand in each page is how the busy
// flag ends up left on after an error in one place and not another, so
// it lives here once.
//
//   const save = useMutation({ onDone: reload });
//   save.run(() => patch(`/registry/${id}`, form), {
//     success: 'Record updated',
//     then: () => setEditing(null),
//   });
//
// `error` holds the backend's message for inline display in a dialog;
// `run` resolves to true on success so a caller can branch.
export function useMutation({ onDone } = {}) {
  const { say } = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (fn, { success, then, silent = false } = {}) => {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      if (success && !silent) say(success);
      then?.(result);
      onDone?.(result);
      return true;
    } catch (e) {
      setError(e.message);
      // A dialog shows the message inline; a bare row action has nowhere
      // to put it, so it also goes to the toast.
      if (silent) say(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [say, onDone]);

  return { busy, error, setError, run, reset: () => setError('') };
}
