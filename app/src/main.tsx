import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyPalette } from './theme';
import { applyTone } from './lib/tone';
import { mayReloadForUpdate } from './lib/staleChunk';

applyPalette(); // 描画の前に配色とトーンを決める (一瞬別の見た目になるのを防ぐ)
applyTone();

// 新しい版の公開後に、古い画面が部品を読めなかったら、1回だけ自動で再読み込みする
window.addEventListener('vite:preloadError', (e) => { if (mayReloadForUpdate()) { e.preventDefault(); window.location.reload(); } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
