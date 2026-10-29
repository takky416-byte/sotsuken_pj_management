import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup,
  signInWithRedirect, signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { clearShared, setTeacherMode } from '../data/shared';
import { countReads } from '../lib/readMeter';

export const SCHOOL_DOMAIN = '@trident.ac.jp';

export type Profile = {
  email: string;
  name: string;
  role: 'student' | 'teacher';
  teamId: string | null;
  sid: string | null;
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'notAllowed'; email: string; reason: 'domain' | 'roster' }
  | { status: 'ready'; profile: Profile };

type Ctx = { state: AuthState; login: () => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<Ctx | null>(null);

/** 教員が「学生の画面」をプレビューするとき、表示する学生のプロフィールで上書きする。 */
export const ProfileOverride = createContext<Profile | null>(null);

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function provider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ hd: 'trident.ac.jp', prompt: 'select_account' });
  return p;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    // リダイレクト方式でのログインに失敗した場合のエラーを拾う
    getRedirectResult(auth).catch((e: { code?: string }) =>
      setState({ status: 'signedOut', error: `ログインに失敗しました (${e.code ?? 'unknown'})` }));

    // 名簿のプロフィールは購読する (名前の変更が反映され、名簿から外された人はその場で入れなくなる)
    let unsubRoster: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubRoster?.();
      unsubRoster = null;
      clearShared(); // 別のユーザーに、前のユーザーの購読を引き継がない
      setTeacherMode(false);
      if (!user) {
        setState((s) => (s.status === 'signedOut' && s.error ? s : { status: 'signedOut' }));
        return;
      }
      const email = (user.email ?? '').toLowerCase();
      if (!user.emailVerified || !email.endsWith(SCHOOL_DOMAIN)) {
        setState({ status: 'notAllowed', email, reason: 'domain' });
        return;
      }
      unsubRoster = onSnapshot(
        doc(db, 'roster', email),
        (snap) => {
          countReads('roster/me', 1);
          if (!snap.exists()) {
            setState({ status: 'notAllowed', email, reason: 'roster' });
            return;
          }
          const d = snap.data() as Omit<Profile, 'email'>;
          setTeacherMode(d.role === 'teacher');
          setState({ status: 'ready', profile: { email, name: d.name, role: d.role, teamId: d.teamId, sid: d.sid } });
        },
        // 名簿にない場合は、ルールで読み取りが拒否されることもある
        () => setState({ status: 'notAllowed', email, reason: 'roster' }),
      );
    });
    return () => {
      unsubAuth();
      unsubRoster?.();
    };
  }, []);

  const login = async () => {
    if (isMobile()) {
      await signInWithRedirect(auth, provider());
      return;
    }
    try {
      await signInWithPopup(auth, provider());
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider());
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setState({ status: 'signedOut', error: `ログインに失敗しました (${code ?? 'unknown'})` });
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    setState({ status: 'signedOut' });
  };

  return <AuthContext.Provider value={{ state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider の外で useAuth を使っています');
  return ctx;
}

export function useProfile(): Profile {
  const override = useContext(ProfileOverride);
  const { state } = useAuth();
  if (override) return override;
  if (state.status !== 'ready') throw new Error('ログインしていません');
  return state.profile;
}
