/**
 * 入力中の内容を保存するとき、他の人が先に同じ項目を変更していないかを判定する。
 *  - mine: 自分が入力した内容 / remote: いま保存されている内容 / base: 編集を始めたときの内容
 *  noop: 変更なし (保存しない) / save: そのまま保存 / conflict: 他の人が先に変更している (どちらにするか選ばせる)
 */
export type CommitDecision = 'noop' | 'save' | 'conflict';

export function decideCommit(mine: string, remote: string, base: string): CommitDecision {
  if (mine === remote) return 'noop'; // 同じ内容になった (他の人と同じ変更をした場合も含む)
  if (remote !== base) return 'conflict'; // 編集中に、他の人が変更した
  return 'save';
}
