import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from './api';

/**
 * loading: checking the session cookie
 * guest: not signed in (answers stay in this browser)
 * signed-in: answers, runs and sign-offs are saved to the account
 * unavailable: the site is running without the account server (e.g. a static host)
 */
export type AccountStatus = 'loading' | 'guest' | 'signed-in' | 'unavailable';

interface AccountValue {
  status: AccountStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  /** Called when a request comes back 401: the session expired elsewhere. */
  expired: () => void;
}

const AccountContext = createContext<AccountValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    let live = true;
    api
      .session()
      .then(({ user: u }) => {
        if (!live) return;
        setUserState(u);
        setStatus(u ? 'signed-in' : 'guest');
      })
      .catch((err: unknown) => {
        if (!live) return;
        setStatus(err instanceof ApiError && err.status !== 0 && err.status < 500 ? 'guest' : 'unavailable');
      });
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: u } = await api.signIn({ email, password });
    setUserState(u);
    setStatus('signed-in');
    return u;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { user: u } = await api.signUp({ name, email, password });
    setUserState(u);
    setStatus('signed-in');
    return u;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } finally {
      setUserState(null);
      setStatus('guest');
    }
  }, []);

  const setUser = useCallback((u: User) => setUserState(u), []);
  const expired = useCallback(() => {
    setUserState(null);
    setStatus('guest');
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, setUser, expired }),
    [status, user, signIn, signUp, signOut, setUser, expired],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>');
  return ctx;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
