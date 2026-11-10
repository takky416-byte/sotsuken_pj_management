import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// スクリプト攻撃への備え (多重防御): 文章はすべて React のエスケープで出していて、HTML は通さない。
// そのうえで、万一、書いた文章がスクリプトとして動いてしまっても、動かないように、ページに「Content-Security-Policy」をつける。
// - 自分のサイトのスクリプトと、ログインに必要な Google のスクリプトだけを動かす (インラインのスクリプト・eval は不可)
// - 通信先は、自分のサイトと、Firebase (Firestore・ログイン) と Google だけ
// - フレームに入れられない。プラグイン (object) は使わない。<base> の書き換えと、フォームの送信先の変更もできない
// 画面の開発サーバー (vite) は、React の更新のためにインラインのスクリプトを使うので、つけるのは、ビルドしたものだけ。
// authDomain はサイト本体と同じ (sotsuken-pj.web.app) なので、ログイン用のフレームは、自分のサイトと同じ。
const POLICY = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:", // リンクのカードのサムネイル・ファビコン (Google) と、ほかのサイトのアイコン
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://sotsuken-pj.web.app https://sotsuken-pj.firebaseapp.com",
  "frame-src 'self' https://sotsuken-pj.web.app https://sotsuken-pj.firebaseapp.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

function csp(mode: string): Plugin {
  return {
    name: 'csp-meta',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html; // 開発サーバーには、つけない
      // 画面テスト (e2e) のビルドだけ、エミュレータへの通信を許す。本番のビルドには入らない
      const emu = mode === 'e2e';
      const extra: Record<string, string> = emu
        ? { 'connect-src': ' http://127.0.0.1:8080 http://127.0.0.1:9099 ws://127.0.0.1:8080', 'frame-src': ' http://127.0.0.1:9099', 'script-src': ' http://127.0.0.1:9099' }
        : {};
      const policy = POLICY.map((d) => d + (extra[d.split(' ')[0]] ?? '')).join('; ');
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), csp(mode)],
}));
