import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Firestore は、複数の項目を使う検索 (「等しい」+「範囲」、範囲+並べ替え (別の項目)、複数の並べ替え) に、複合インデックスを求める。
// エミュレータでは起きず、本番だけで「読み込み中」のまま止まる (過去にあった)。
// インデックスを増やさない方針なので、そういう検索を書いたら、このテストで気づけるようにする。
const SRC = ['src/data', 'src/components', 'src/features'];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []));
}

/** query( ... ) の中身を、括弧の対応をとって取り出す */
function queries(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bquery\(/g)) {
    let depth = 1, i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) { if (text[i] === '(') depth++; else if (text[i] === ')') depth--; i++; }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

/** その検索が、複合インデックスを必要とするか */
export function needsCompositeIndex(q: string): boolean {
  const wheres = [...q.matchAll(/where\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map((m) => ({ field: m[1], op: m[2] }));
  const orders = [...q.matchAll(/orderBy\(\s*'([^']+)'/g)].map((m) => m[1]);
  const eq = wheres.filter((w) => w.op === '==' || w.op === 'in' || w.op === 'array-contains');
  const range = wheres.filter((w) => !eq.includes(w));
  const fields = new Set([...range.map((w) => w.field), ...orders]);
  if (orders.length > 1) return true; // 複数の並べ替え
  if (fields.size > 1) return true; // 範囲と、別の項目の並べ替え / 別の項目の範囲
  if (eq.length > 0 && fields.size > 0) return true; // 「等しい」+ 範囲 / 並べ替え
  if (eq.length > 1 && eq.some((e) => e.field !== eq[0].field)) return false; // 「等しい」だけの組み合わせは、自動のインデックスで足りる
  return false;
}

describe('複合インデックスが必要な検索を書いていない', () => {
  test('判定のしかた', () => {
    expect(needsCompositeIndex("col, where('sid', '==', x), where('date', '>=', y)")).toBe(true);
    expect(needsCompositeIndex("col, where('date', '>=', y), orderBy('date', 'desc'), limit(5)")).toBe(false);
    expect(needsCompositeIndex("col, where('date', '>=', y), orderBy('createdAt')")).toBe(true);
    expect(needsCompositeIndex("col, orderBy('a'), orderBy('b')")).toBe(true);
    expect(needsCompositeIndex("col, where('teamId', '==', t)")).toBe(false);
    expect(needsCompositeIndex("col, orderBy('date', 'desc'), limit(3)")).toBe(false);
  });
  test('アプリのすべての検索', () => {
    const bad = SRC.flatMap(files).flatMap((f) => queries(readFileSync(f, 'utf8')).filter(needsCompositeIndex).map((q) => `${f}: ${q.trim().slice(0, 120)}`));
    expect(bad).toEqual([]);
  });
});
