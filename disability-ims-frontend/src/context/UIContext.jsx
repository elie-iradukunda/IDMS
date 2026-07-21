import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { makeT } from '../lib/i18n.js';

const UIContext = createContext(null);
const A11Y_KEY = 'ids_a11y';

const DEFAULT_A11Y = { lang: 'en', zoom: 1, hc: false };

export function UIProvider({ children }) {
  const [a, setA] = useState(() => {
    try {
      return { ...DEFAULT_A11Y, ...JSON.parse(localStorage.getItem(A11Y_KEY) || '{}') };
    } catch {
      return DEFAULT_A11Y;
    }
  });
  const [toast, setToast] = useState('');
  const toastTimer = useRef();

  // Persist accessibility preferences and reflect high-contrast on <body>.
  useEffect(() => {
    localStorage.setItem(A11Y_KEY, JSON.stringify(a));
    document.body.classList.toggle('hc', a.hc);
    document.documentElement.lang = a.lang;
  }, [a]);

  const say = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  const t = useMemo(() => makeT(a.lang), [a.lang]);

  return (
    <UIContext.Provider value={{ a, setA, t, toast, say }}>{children}</UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
