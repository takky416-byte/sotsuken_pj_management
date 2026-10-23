import { describe, expect, test } from 'vitest';
import { guessDate, parseQuickAdd } from './quickAdd';

const members = [{ sid: 'D1', name: '小林' }, { sid: 'D2', name: '高瀬' }, { sid: 'D3', name: '鈴木秀' }];
const TODAY = '2026-11-10';

describe('parseQuickAdd', () => {
  test('担当と期限を読み取り、タスク名だけを残す', () => {
    expect(parseQuickAdd('ログイン画面を作る @小林 〜11/30', members, TODAY)).toEqual({ title: 'ログイン画面を作る', assignees: ['D1'], endDate: '2026-11-30' });
    expect(parseQuickAdd('ワイヤーフレーム @高瀬 @小林 12/5まで', members, TODAY)).toEqual({ title: 'ワイヤーフレーム', assignees: ['D2', 'D1'], endDate: '2026-12-05' });
  });
  test('名前は先頭が合えばよい。同じ人は1回だけ。全角の@・〜も読む', () => {
    expect(parseQuickAdd('調査 ＠鈴木 @鈴木秀 ～12/1', members, TODAY).assignees).toEqual(['D3']);
  });
  test('読み取れないものは、タスク名のまま残す (知らない名前・存在しない日付)', () => {
    expect(parseQuickAdd('連絡 @佐藤 〜2/30', members, TODAY)).toEqual({ title: '連絡 @佐藤 〜2/30', assignees: [], endDate: null });
    expect(parseQuickAdd('機能一覧を作る', members, TODAY)).toEqual({ title: '機能一覧を作る', assignees: [], endDate: null });
  });
  test('タスク名が空になるときは、入力をそのまま使う', () => {
    expect(parseQuickAdd('@小林 〜11/30', members, TODAY)).toEqual({ title: '@小林 〜11/30', assignees: [], endDate: null });
  });
});

describe('guessDate', () => {
  test('今日から見て半年以上前になる月日は、来年にする', () => {
    expect(guessDate(11, 30, '2026-11-10')).toBe('2026-11-30');
    expect(guessDate(9, 1, '2026-11-10')).toBe('2026-09-01'); // 半年以内の過去は、今年のまま
    expect(guessDate(1, 20, '2026-11-10')).toBe('2027-01-20'); // 約10か月前 → 来年
    expect(guessDate(2, 1, '2026-12-28')).toBe('2027-02-01');
  });
});
