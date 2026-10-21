import { useState } from 'react';
import { api } from '../api.js';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', inviteCode: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      onAuth(await api('POST', mode === 'login' ? '/login' : '/register', f));
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>卒研PJ管理</h1>
      {mode === 'register' && (
        <label>名前<input value={f.name} onChange={set('name')} required /></label>
      )}
      <label>メールアドレス<input type="email" value={f.email} onChange={set('email')} required /></label>
      <label>パスワード{mode === 'register' && '（8文字以上）'}
        <input type="password" value={f.password} onChange={set('password')} required />
      </label>
      {mode === 'register' && (
        <label>招待コード<small>（最初の1人目＝教員は空欄でOK）</small>
          <input value={f.inviteCode} onChange={set('inviteCode')} />
        </label>
      )}
      {err && <p className="error">{err}</p>}
      <button type="submit">{mode === 'login' ? 'ログイン' : '新規登録'}</button>
      <button type="button" className="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
        {mode === 'login' ? '新規登録はこちら' : 'ログインに戻る'}
      </button>
    </form>
  );
}
