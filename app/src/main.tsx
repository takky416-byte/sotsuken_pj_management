import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyPalette } from './theme';
import { applyTone } from './lib/tone';

applyPalette(); // 描画の前に配色とトーンを決める (一瞬別の見た目になるのを防ぐ)
applyTone();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
