// 達成の演出 (紙吹雪+ひとこと)。画面のどこからでも呼べる、小さなイベントの仕組み。
type Listener = (message: string) => void;
const listeners = new Set<Listener>();

export const celebrate = (message: string) => listeners.forEach((fn) => fn(message));
export function onCelebrate(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
