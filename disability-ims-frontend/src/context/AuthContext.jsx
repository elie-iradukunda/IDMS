import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { post, get, setToken, getToken } from '../lib/api.js';

const AuthContext = createContext(null);
const USER_KEY = 'ids_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return getToken() ? JSON.parse(localStorage.getItem(USER_KEY) || 'null') : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  const persist = useCallback((u) => {
    setUser(u);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    persist(null);
  }, [persist]);

  const login = useCallback(
    async (email, password) => {
      const { token, user: u } = await post('/auth/login', { email, password });
      setToken(token);
      persist(u);
      return u;
    },
    [persist],
  );

  // On first load with a stored token, refresh the profile so a stale or
  // revoked session is cleaned up rather than trusted blindly.
  useEffect(() => {
    let alive = true;
    if (getToken()) {
      get('/me')
        .then((u) => alive && persist(u))
        .catch(() => alive && logout())
        .finally(() => alive && setReady(true));
    } else {
      setReady(true);
    }
    return () => {
      alive = false;
    };
  }, [persist, logout]);

  // The API client emits this on any 401 — force a clean logout.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('ids:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ids:unauthorized', onUnauthorized);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
