import { describe, expect, test } from 'vitest';
import { decideCommit } from './editConflict';

describe('decideCommit', () => {
  test('変更なし・そのまま保存・競合', () => {
    expect(decideCommit('A', 'A', 'A')).toBe('noop'); // 何も変えていない
    expect(decideCommit('B', 'A', 'A')).toBe('save'); // 自分だけが変えた
    expect(decideCommit('B', 'C', 'A')).toBe('conflict'); // 編集中に、他の人が C に変えた
    expect(decideCommit('C', 'C', 'A')).toBe('noop'); // 他の人と同じ内容
  });
});
