// src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import api from '../api';

interface AuthUser {
  id: string;
  wallet_address: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthLoading: boolean;
  authError: string | null;
  loginWithWallet: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthLoading: false,
  authError: null,
  loginWithWallet: async () => {},
  logout: () => {},
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
      const message = `Login to Freelance Escrow\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });
      const { data } = await api.post('/auth/wallet-login', { address, signature, message });
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

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setError(null);
  }, []);

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