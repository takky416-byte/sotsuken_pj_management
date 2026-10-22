import { useEffect, useState } from 'react';
import { onCelebrate } from '../lib/celebrate';

const COLORS = ['#2f6fed', '#2e9e5b', '#f0a93b', '#d93636', '#9b59b6'];
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100, delay: (i % 7) * 0.05, color: COLORS[i % COLORS.length], rot: (i * 53) % 360,
}));

/** 達成の演出。動きを減らす設定 (prefers-reduced-motion) のときは、紙吹雪を出さず、ひとことだけ。 */
export function Celebration() {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => onCelebrate((text) => setMsg({ text, key: Date.now() })), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div className="celebrate" key={msg.key} role="status" aria-live="polite">
      <div className="confetti" aria-hidden="true">
        {PIECES.map((p, i) => <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, background: p.color, transform: `rotate(${p.rot}deg)` }} />)}
      </div>
      <div className="celebrate-msg">{msg.text}</div>
    </div>
  );
}
