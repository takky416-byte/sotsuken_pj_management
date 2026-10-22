import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyPalette } from './theme';

applyPalette(); // 描画の前に配色を決める (一瞬別の色になるのを防ぐ)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
