import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiClient } from './api';
import { wsService } from './websocket';

export type Role = 'ADMIN' | 'USER' | 'HOSPITAL';
export interface Account { id: number; email: string; role: Role; display_name: string; hospital_id: number | null }
interface AuthValue { account: Account | null; loading: boolean; signIn: (email: string, password: string) => Promise<void>; register: (display_name: string, email: string, password: string) => Promise<void>; signOut: () => void }
const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = 'mediroute_access_token';
const ACCOUNT_KEY = 'mediroute_account';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [account, setAccount] = useState<Account | null>(() => {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const save = (result: { access_token: string; account: Account }) => {
    wsService.disconnect();
    localStorage.setItem(TOKEN_KEY, result.access_token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(result.account));
    setAccount(result.account);
  };
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    apiClient.get<Account>('/auth/me').then(({ data }) => { setAccount(data); localStorage.setItem(ACCOUNT_KEY, JSON.stringify(data)); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ACCOUNT_KEY); setAccount(null); })
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthValue>(() => ({ account, loading,
    signIn: async (email, password) => { const { data } = await apiClient.post('/auth/login', { email, password }); save(data); },
    register: async (display_name, email, password) => { const { data } = await apiClient.post('/auth/register', { display_name, email, password }); save(data); },
    signOut: () => { wsService.disconnect(); localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ACCOUNT_KEY); setAccount(null); },
  }), [account, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; };
export const homeForRole = (account: Account) => account.role === 'ADMIN' ? '/dispatcher' : account.role === 'USER' ? '/user' : `/hospital/${account.hospital_id}`;
export const RequireRole: React.FC<React.PropsWithChildren<{ roles: Role[] }>> = ({ roles, children }) => {
  const { account, loading } = useAuth(); const location = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center text-slate-500">Restoring your secure session…</div>;
  if (!account) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(account.role)) return <Navigate to={homeForRole(account)} replace />;
  return <>{children}</>;
};
