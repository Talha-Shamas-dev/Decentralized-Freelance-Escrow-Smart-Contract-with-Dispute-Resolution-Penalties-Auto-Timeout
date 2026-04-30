// src/context/AuthContext.tsx
import {
  createContext, useContext, useEffect,
  useState, useCallback, type ReactNode,
} from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import api from '../api';   // ✅ use your existing api.ts

interface AuthUser {
  id: string;
  wallet_address: string;
  role: string;
}

interface AuthCtx {
  user: AuthUser | null;
  isAuthLoading: boolean;
  authError: string | null;
  loginWithWallet: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null, isAuthLoading: false, authError: null,
  loginWithWallet: async () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginWithWallet = useCallback(async () => {
    if (!address) {
      setError('No wallet connected');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Ask wallet to sign a message (proves ownership)
      const message = `Login to Freelance Escrow\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      // 2. Send wallet + signature to backend endpoint /auth/wallet-login
      const { data } = await api.post<{ access_token: string; refresh_token: string; user: AuthUser }>(
        '/auth/wallet-login',
        { address, signature, message }
      );

      // 3. Save tokens (optional – api.ts uses getAccessToken, but we can also store in localStorage)
      //    For simplicity, store in localStorage (api.ts already reads from there)
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setUser(data.user);
    } catch (err: any) {
      console.error('Login failed', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }, [address, signMessageAsync]);

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        await api.post('/auth/logout', { refresh_token: refresh });
      }
    } catch (e) {}
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setError(null);
  }, []);

  // Auto‑restore session if we have a token
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token && isConnected && address) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => logout());
    } else if (!isConnected) {
      logout();
    }
  }, [address, isConnected, logout]);

  return (
    <AuthContext.Provider value={{ user, isAuthLoading: loading, authError: error, loginWithWallet, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);