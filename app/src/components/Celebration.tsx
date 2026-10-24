import { useEffect, useState } from 'react';
import { onCelebrate } from '../lib/celebrate';
import { useTone } from '../lib/tone';

const COLORS = ['#2f6fed', '#2e9e5b', '#f0a93b', '#d93636', '#9b59b6'];
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100, delay: (i % 7) * 0.05, color: COLORS[i % COLORS.length], rot: (i * 53) % 360,
}));

/** 達成の知らせ。画面の上に、ひとことだけ短く出す。「カジュアル」トーンのときだけ、紙吹雪も出す (動きを減らす設定では出さない)。 */
export function Celebration() {
  const tone = useTone();
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
      {tone === 'casual' && (
        <div className="confetti" aria-hidden="true">
          {PIECES.map((p, i) => <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, background: p.color, transform: `rotate(${p.rot}deg)` }} />)}
        </div>
      )}
      <div className="celebrate-msg">{tone !== 'simple' && <span aria-hidden="true">✓ </span>}{msg.text}</div>
    </div>
  );
}
