// 毎日のバックアップ (Apps Script) の対象が、アプリの書き出し・復元の対象と食い違わないことを確かめる。
// 新しいコレクションを足したときに、バックアップへの追加を忘れないための番人。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEAM_SUBCOLLECTIONS, TOP_COLLECTIONS } from './export';

const list = (name: string): string[] => {
  const src = readFileSync('../apps-script/Code.js', 'utf8');
  const m = src.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} が見つかりません`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

describe('バックアップの対象 (Apps Script とアプリ)', () => {
  it('トップのコレクションが一致する', () => {
    expect(list('TOP_COLLECTIONS').sort()).toEqual([...TOP_COLLECTIONS].sort());
  });
  it('チームのサブコレクションが一致する', () => {
    expect(list('TEAM_SUBCOLLECTIONS').sort()).toEqual([...TEAM_SUBCOLLECTIONS].sort());
  });
});
