import { useAuth, type AuthState } from './AuthProvider';

export function LoginPage({ error }: { error?: string }) {
  const { login } = useAuth();
  return (
    <main className="center-card">
      <h1>卒研PJ管理</h1>
      <p>学校のGoogleアカウント(@trident.ac.jp)でログインしてください。</p>
      <button onClick={login}>Googleでログイン</button>
      {error && <p className="error">{error}</p>}
      <p className="hint">LINEなどのアプリ内ブラウザでは動きません。SafariまたはChromeで開いてください。</p>
    </main>
  );
}

export function NotAllowedPage({ state }: { state: Extract<AuthState, { status: 'notAllowed' }> }) {
  const { logout } = useAuth();
  return (
    <main className="center-card">
      <h1>ログインできません</h1>
      {state.reason === 'domain'
        ? <p>{state.email} は学校のアカウントではありません。@trident.ac.jp のアカウントでログインしてください。</p>
        : <p>{state.email} は名簿に登録されていません。先生に連絡してください。</p>}
      <button onClick={logout}>別のアカウントでログインする</button>
    </main>
  );
}
