import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './config.js';

const DOMAIN = '@trident.ac.jp';
const $ = (id) => document.getElementById(id);
const out = $('result');

const lines = [];
const log = (s) => { lines.push(s); out.textContent = lines.join('\n'); $('copy').hidden = false; };
const header = () => {
  lines.length = 0;
  log(`日時: ${new Date().toLocaleString('ja-JP')}`);
  log(`ブラウザ: ${navigator.userAgent}`);
  log(`ページのURL: ${location.origin}`);
};

if (firebaseConfig.apiKey === 'REPLACE_ME') {
  $('status').textContent = 'config.js が未設定です。先生に連絡してください。';
  $('login').disabled = true;
}

const auth = firebaseConfig.apiKey === 'REPLACE_ME' ? null : getAuth(initializeApp(firebaseConfig));

$('login').addEventListener('click', async () => {
  header();
  $('status').textContent = 'ログイン中…';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'trident.ac.jp', prompt: 'select_account' });
  try {
    const { user } = await signInWithPopup(auth, provider);
    const okDomain = (user.email ?? '').toLowerCase().endsWith(DOMAIN);
    log('結果: ログイン成功');
    log(`メールアドレスの末尾が ${DOMAIN}: ${okDomain ? 'はい' : 'いいえ'}`);
    log(`メール確認済み: ${user.emailVerified ? 'はい' : 'いいえ'}`);
    log(`メールアドレス: ${user.email}`);
    $('status').textContent = okDomain
      ? 'ログインできました。この画面の結果を先生に送ってください。'
      : '学校のアカウントではありません。@trident.ac.jp のアカウントで試してください。';
    $('logout').hidden = false;
  } catch (e) {
    log('結果: ログイン失敗');
    log(`エラーコード: ${e.code ?? '(なし)'}`);
    log(`メッセージ: ${e.message}`);
    $('status').textContent = '失敗しました。この画面の結果を先生に送ってください。';
  }
});

$('logout').addEventListener('click', async () => {
  await signOut(auth);
  $('logout').hidden = true;
  $('status').textContent = 'ログアウトしました。';
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(out.textContent);
    $('status').textContent = '結果をコピーしました。先生に貼り付けて送ってください。';
  } catch {
    $('status').textContent = '自動でコピーできませんでした。結果を選択してコピーしてください。';
  }
});
