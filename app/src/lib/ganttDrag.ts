// ガント上のドラッグ操作で決まる日付 (画面に依存しない)。
import { addDays } from './dates';

export type DragKind = 'move' | 'start' | 'end' | 'new';

/**
 * ドラッグ中・ドラッグ後の、開始日・終了日。
 * - move: バー全体を delta 日ずらす
 * - start: 左端 (開始日) を動かす。終了日より後ろには行かない
 * - end: 右端 (終了日) を動かす。開始日より前には行かない
 * - new: 日付のない行をなぞる。押した日 (anchor) と、いまの日 (anchor + delta) の間が期間になる
 */
export function dragDates(
  kind: DragKind, orig: { start: string; end: string }, delta: number, anchor?: string,
): { start: string; end: string } {
  if (kind === 'move') return { start: addDays(orig.start, delta), end: addDays(orig.end, delta) };
  if (kind === 'start') {
    const s = addDays(orig.start, delta);
    return { start: s > orig.end ? orig.end : s, end: orig.end };
  }
  if (kind === 'end') {
    const e = addDays(orig.end, delta);
    return { start: orig.start, end: e < orig.start ? orig.start : e };
  }
  const a = anchor ?? orig.start;
  const b = addDays(a, delta);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** 画面上の位置 (px) から、トラックの何日目か。トラックの幅 (px) と日数から求める。 */
export function dayAt(x: number, trackLeft: number, trackWidth: number, days: number): number {
  return Math.floor(((x - trackLeft) / Math.max(1, trackWidth)) * days);
}
