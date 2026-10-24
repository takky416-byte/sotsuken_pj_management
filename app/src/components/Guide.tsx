import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Em } from './Em';
import { GUIDE_SEEN_KEY, SCENES, TOUR, stepForPath } from '../lib/guide';

type Ctx = { open: (opts?: { tab?: 'tour' | 'scenes'; step?: number }) => void } | null;
const GuideContext = createContext<Ctx>(null);

/** 学生の利用ガイド (操作方法と、場面ごとのやり方)。教員のプレビューには置かない。 */
export function GuideProvider({ email, children }: { email: string; children: ReactNode }) {
  const [state, setState] = useState<{ tab: 'tour' | 'scenes'; step: number } | null>(null);
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const open = useCallback((opts?: { tab?: 'tour' | 'scenes'; step?: number }) => {
    setState({ tab: opts?.tab ?? 'tour', step: opts?.step ?? stepForPath(pathRef.current) });
  }, []);
  const close = () => {
    try { localStorage.setItem(GUIDE_SEEN_KEY(email), '1'); } catch { /* 保存できなくても閉じられる */ }
    setState(null);
  };

  return (
    <GuideContext.Provider value={{ open }}>
      {children}
      {state && <GuideModal state={state} setState={setState} onClose={close} />}
    </GuideContext.Provider>
  );
}

export const useGuide = () => useContext(GuideContext);

/** ヘッダーの「ガイド」ボタン。開いた画面に合わせた説明から始まる。 */
export function GuideButton() {
  const g = useGuide();
  if (!g) return null;
  return <button type="button" className="ghost guide-btn" onClick={() => g.open()} aria-haspopup="dialog"><Em e="💡" />ガイド</button>;
}

/** 初回(案内の確認のあと)に、一度だけ自動で開く。 */
export function GuideAutoOpen({ email }: { email: string }) {
  const g = useGuide();
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(GUIDE_SEEN_KEY(email)) === '1'; } catch { /* 読めなければ、表示する */ }
    if (!seen) g?.open({ tab: 'tour', step: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function GuideModal({ state, setState, onClose }: {
  state: { tab: 'tour' | 'scenes'; step: number };
  setState: (s: { tab: 'tour' | 'scenes'; step: number }) => void;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [openScene, setOpenScene] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (to: string | undefined) => { onClose(); if (to !== undefined) nav(to === '' ? '/' : `/${to}`); };
  const step = TOUR[state.step];
  const last = state.step === TOUR.length - 1;

  return (
    <div className="guide-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="guide" role="dialog" aria-modal="true" aria-label="利用ガイド" tabIndex={-1} ref={ref}>
        <div className="guide-head">
          <div className="guide-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={state.tab === 'tour'} className={state.tab === 'tour' ? 'on' : ''} onClick={() => setState({ ...state, tab: 'tour' })}>はじめてのガイド</button>
            <button type="button" role="tab" aria-selected={state.tab === 'scenes'} className={state.tab === 'scenes' ? 'on' : ''} onClick={() => setState({ ...state, tab: 'scenes' })}>こんなとき</button>
          </div>
          <button type="button" className="ghost icon" aria-label="ガイドを閉じる" onClick={onClose}>×</button>
        </div>

        {state.tab === 'tour' ? (
          <div className="guide-body">
            <div className="guide-dots" aria-label={`${state.step + 1} / ${TOUR.length}`}>
              {TOUR.map((t, i) => <button key={t.id} type="button" className={`gdot ${i === state.step ? 'on' : ''}`} aria-label={`${i + 1}. ${t.title}`} onClick={() => setState({ ...state, step: i })} />)}
            </div>
            <h3>{step.title}</h3>
            <p className="guide-lead">{step.lead}</p>
            <ul className="guide-points">{step.points.map((p) => <li key={p}>{p}</li>)}</ul>
            {(step.scenes ?? []).length > 0 && (
              <div className="guide-scenes">
                <div className="label">この画面でよくある場面</div>
                {(step.scenes ?? []).map((id) => {
                  const s = SCENES.find((x) => x.id === id);
                  return s && <SceneItem key={s.id} scene={s} open={openScene === s.id} onToggle={() => setOpenScene(openScene === s.id ? null : s.id)} go={go} />;
                })}
              </div>
            )}
            <div className="guide-foot">
              <button type="button" className="ghost" disabled={state.step === 0} onClick={() => setState({ ...state, step: state.step - 1 })}>← 前へ</button>
              {step.to !== undefined && <button type="button" className="ghost" onClick={() => go(step.to)}>この画面を開く</button>}
              {last ? <button type="button" onClick={onClose}>はじめる</button> : <button type="button" onClick={() => setState({ ...state, step: state.step + 1 })}>次へ →</button>}
            </div>
          </div>
        ) : (
          <div className="guide-body">
            <p className="guide-lead">場面を選ぶと、やり方が出ます。</p>
            {SCENES.map((s) => <SceneItem key={s.id} scene={s} open={openScene === s.id} onToggle={() => setOpenScene(openScene === s.id ? null : s.id)} go={go} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function SceneItem({ scene, open, onToggle, go }: { scene: (typeof SCENES)[number]; open: boolean; onToggle: () => void; go: (to: string | undefined) => void }) {
  return (
    <div className={`scene ${open ? 'open' : ''}`}>
      <button type="button" className="scene-title" aria-expanded={open} onClick={onToggle}>{scene.title}</button>
      {open && (
        <div className="scene-body">
          <ol>{scene.steps.map((x) => <li key={x}>{x}</li>)}</ol>
          {scene.to !== undefined && <button type="button" onClick={() => go(scene.to)}>{scene.toLabel ?? '開く'}</button>}
        </div>
      )}
    </div>
  );
}
