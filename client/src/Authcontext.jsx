import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokens } from './api';
import { closeSocket } from './socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      if (tokens.refresh) await api.post('/auth/logout', { refreshToken: tokens.refresh });
    } catch { /* ignore */ }
    tokens.clear();
    closeSocket();
    setUser(null);
  }, []);

  // On first load: if we have a token, ask the server who we are
  useEffect(() => {
    const onForcedLogout = () => {
      closeSocket();
      setUser(null);
    };
    window.addEventListener('devsync:logout', onForcedLogout);

    (async () => {
      if (tokens.access || tokens.refresh) {
        try {
          const data = await api.get('/auth/me');
          setUser(data.user);
        } catch {
          tokens.clear();
        }
      }
      setLoading(false);
    })();

    return () => window.removeEventListener('devsync:logout', onForcedLogout);
  }, []);

  const authenticate = async (path, body) => {
    const data = await api.post(path, body);
    closeSocket();
    tokens.set(data);
    setUser(data.user);
  };

  const value = {
    user,
    loading,
    login: (email, password) => authenticate('/auth/login', { email, password }),
    register: (name, email, password) => authenticate('/auth/register', { name, email, password }),
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);