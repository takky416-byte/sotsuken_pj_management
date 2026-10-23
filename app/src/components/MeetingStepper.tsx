import { useEffect, useRef, useState } from 'react';
import { MEETING_STEPS, TOTAL_MINUTES, mmss, stepAtElapsed } from '../lib/meetingFlow';

/**
 * 進捗確認会議の進め方 (1チーム10分)。4つの段階を順に進める。タイマーは目安で、自動では切り替えない。
 * 画面は、いまの段階に必要なものだけを出す。「ぜんぶ表示」で、すべてを並べて見られる。
 */
export function MeetingStepper({ step, onStep, all, onAll }: {
  step: number; onStep: (i: number) => void; all: boolean; onAll: (v: boolean) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (!running) return;
    last.current = Date.now();
    const id = setInterval(() => { const n = Date.now(); setElapsed((e) => e + (n - last.current) / 1000); last.current = n; }, 500);
    return () => clearInterval(id);
  }, [running]);

  const cur = MEETING_STEPS[step];
  const timed = stepAtElapsed(elapsed);
  const over = running || elapsed > 0 ? timed.remainingSec < 0 : false;

  return (
    <section className="card stepper" aria-label="会議の進め方">
      <div className="stepper-head">
        <h3>進捗確認会議の進め方 <span className="hint">({TOTAL_MINUTES}分)</span></h3>
        <div className="stepper-timer">
          <span className={`timer ${over ? 'over' : ''}`} aria-label="経過時間">{mmss(elapsed)}</span>
          {(running || elapsed > 0) && <span className={`hint ${over ? 'over' : ''}`}>{MEETING_STEPS[timed.index].title}: 残り {mmss(timed.remainingSec)}</span>}
          <button type="button" className="ghost" onClick={() => setRunning((r) => !r)}>{running ? '一時停止' : elapsed > 0 ? '再開' : '▶ 開始'}</button>
          {elapsed > 0 && <button type="button" className="ghost" onClick={() => { setRunning(false); setElapsed(0); }}>リセット</button>}
        </div>
      </div>
      <ol className="steps">
        {MEETING_STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button" className={`step ${!all && i === step ? 'on' : ''} ${(running || elapsed > 0) && i === timed.index ? 'now' : ''}`}
              aria-current={!all && i === step ? 'step' : undefined} onClick={() => { onAll(false); onStep(i); }}
            >
              <span className="step-no">{i + 1}</span>
              <span className="step-title">{s.title}</span>
              <span className="step-min">{s.minutes}分</span>
            </button>
          </li>
        ))}
      </ol>
      {!all && (
        <div className="step-guide">
          <p><strong>ねらい:</strong> {cur.goal}</p>
          <ul className="plain asks">{cur.asks.map((a) => <li key={a}>💬 {a}</li>)}</ul>
        </div>
      )}
      <div className="stepper-foot">
        <button type="button" className="ghost" disabled={all || step === 0} onClick={() => onStep(step - 1)}>← 前へ</button>
        <label className="check"><input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} />ぜんぶ表示</label>
        <button type="button" disabled={all || step === MEETING_STEPS.length - 1} onClick={() => onStep(step + 1)}>次へ →</button>
      </div>
    </section>
  );
}
