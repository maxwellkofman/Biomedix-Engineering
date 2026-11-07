import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, onApiError, type Org, type Role, type SessionPayload, type User } from './api';

/**
 * loading: checking the session cookie
 * guest: not signed in (answers stay in this browser)
 * signed-in: work is saved to the active company's projects
 * unavailable: the site is running without the account server (e.g. a static host)
 */
export type AccountStatus = 'loading' | 'guest' | 'signed-in' | 'unavailable';

export type SignInResult = { user: User } | { ticket: string };

export interface SignUpFields {
  name: string;
  email: string;
  password: string;
  company?: string;
  invite?: string;
  acceptTerms: boolean;
}

interface AccountValue {
  status: AccountStatus;
  user: User | null;
  /** Companies the user belongs to. */
  orgs: Org[];
  /** The company the app is working in. */
  org: Org | null;
  /** The active company requires two-factor and this account doesn't have it yet. */
  mfaBlocked: boolean;
  /** The server runs in dev mode (emails go to /dev/mail). */
  dev: boolean;
  switchOrg: (id: string) => void;
  /** Apply a fresh {user, orgs} from any account call. */
  apply: (p: SessionPayload, activeOrg?: string) => void;
  signIn: (email: string, password: string, remember: boolean) => Promise<SignInResult>;
  completeSignIn: (ticket: string, code: string) => Promise<{ user: User; recoveryCodesLeft?: number }>;
  signUp: (f: SignUpFields) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Called when a request comes back 401: the session ended elsewhere. */
  expired: () => void;
}

const AccountContext = createContext<AccountValue | null>(null);
const orgKey = (userId: string) => `biomedix.org.${userId}`;

function recallOrg(userId: string) {
  try {
    return localStorage.getItem(orgKey(userId));
  } catch {
    return null;
  }
}
function rememberOrg(userId: string, orgId: string) {
  try {
    localStorage.setItem(orgKey(userId), orgId);
  } catch {
    /* ignore */
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [user, setUserState] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [dev, setDev] = useState(false);

  const apply = useCallback((p: SessionPayload, activeOrg?: string) => {
    setUserState(p.user);
    setOrgs(p.orgs);
    setStatus('signed-in');
    setOrgId((current) => {
      const wanted = activeOrg ?? current ?? recallOrg(p.user.id);
      const next = p.orgs.find((o) => o.id === wanted)?.id ?? p.orgs[0]?.id ?? null;
      if (next) rememberOrg(p.user.id, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setUserState(null);
    setOrgs([]);
    setOrgId(null);
    setStatus('guest');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.session();
      setDev(s.dev);
      if (s.user) apply({ user: s.user, orgs: s.orgs });
      else clear();
    } catch (err) {
      setStatus(err instanceof ApiError && err.status !== 0 && err.status < 500 ? 'guest' : 'unavailable');
    }
  }, [apply, clear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 from any request means the session ended (signed out elsewhere, password reset, expiry).
  useEffect(
    () =>
      onApiError((err) => {
        if (err.status === 401 && err.code === 'signed_out') clear();
      }),
    [clear],
  );

  const signIn = useCallback(
    async (email: string, password: string, remember: boolean): Promise<SignInResult> => {
      const r = await api.signIn({ email, password, remember });
      if ('ticket' in r) return { ticket: r.ticket };
      apply(r);
      return { user: r.user };
    },
    [apply],
  );

  const completeSignIn = useCallback(
    async (ticket: string, code: string) => {
      const r = await api.signInMfa({ ticket, code });
      apply(r);
      return { user: r.user, recoveryCodesLeft: r.recoveryCodesLeft };
    },
    [apply],
  );

  const signUp = useCallback(
    async (f: SignUpFields) => {
      const r = await api.signUp(f);
      apply(r, r.joined ?? r.orgs[0]?.id);
      return r.user;
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } finally {
      clear();
    }
  }, [clear]);

  const switchOrg = useCallback(
    (id: string) => {
      if (!user || !orgs.some((o) => o.id === id)) return;
      rememberOrg(user.id, id);
      setOrgId(id);
    },
    [user, orgs],
  );

  const org = orgs.find((o) => o.id === orgId) ?? null;
  const mfaBlocked = !!(org?.requireMfa && user && !user.mfaEnabled);

  const value = useMemo(
    () => ({ status, user, orgs, org, mfaBlocked, dev, switchOrg, apply, signIn, completeSignIn, signUp, signOut, refresh, expired: clear }),
    [status, user, orgs, org, mfaBlocked, dev, switchOrg, apply, signIn, completeSignIn, signUp, signOut, refresh, clear],
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

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything, including billing, owners and deleting the company',
  admin: 'Manages members, invitations, security and projects',
  editor: 'Answers questions, saves runs and submits drafts for review',
  viewer: 'Reads documentation and history; can’t change anything',
};

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
export type Perm = 'view' | 'edit' | 'manage' | 'own';
const NEED: Record<Perm, number> = { view: 0, edit: 1, manage: 2, own: 3 };
export const can = (org: Org | null, perm: Perm) => !!org && RANK[org.role] >= NEED[perm];
