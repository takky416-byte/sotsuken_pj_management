import { describe, expect, test } from 'vitest';
import { assignSids, parseCsv, parseRoster } from './csv';

describe('parseCsv', () => {
  test('カンマ・タブ・クォート・BOM・空行', () => {
    expect(parseCsv('﻿a,b\r\n\r\n"x,1",y\n')).toEqual([['a', 'b'], ['x,1', 'y']]);
    expect(parseCsv('岩田\ta@trident.ac.jp\tA')).toEqual([['岩田', 'a@trident.ac.jp', 'A']]);
    expect(parseCsv('"a ""q"" b",c')).toEqual([['a "q" b', 'c']]);
  });
});

describe('parseRoster', () => {
  test('正しい行と見出しの読み飛ばし', () => {
    const r = parseRoster('苗字,メールアドレス,チーム\n岩田,Iwata@Trident.ac.jp,a\n近内,k@trident.ac.jp,A');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { name: '岩田', email: 'iwata@trident.ac.jp', teamId: 'A' },
      { name: '近内', email: 'k@trident.ac.jp', teamId: 'A' },
    ]);
  });
  test('エラーの検出', () => {
    const r = parseRoster('岩田,a@gmail.com,A\n,b@trident.ac.jp,A\n森,c@trident.ac.jp,Z\n竹中,d@trident.ac.jp,A\n竹中,D@trident.ac.jp,A');
    expect(r.rows.map((x) => x.name)).toEqual(['竹中']);
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 5]);
  });
});

describe('assignSids', () => {
  test('既存の sid を維持し、空き番号を割り当てる', () => {
    const existing = new Map([['a@trident.ac.jp', { sid: 'A2' }]]);
    const out = assignSids([
      { name: 'x', email: 'b@trident.ac.jp', teamId: 'A' },
      { name: 'y', email: 'a@trident.ac.jp', teamId: 'A' },
      { name: 'z', email: 'c@trident.ac.jp', teamId: 'B' },
    ], existing);
    expect(out.map((o) => o.sid)).toEqual(['A1', 'A2', 'B1']);
  });
});
