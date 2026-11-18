import { describe, expect, test } from 'vitest';
import { chunkText, wrappedLines } from './paraChunks';

describe('paraChunks', () => {
  test('折り返しと改行を数える。空行は1行', () => {
    expect(wrappedLines('あ'.repeat(61), 60)).toBe(2);
    expect(wrappedLines('a\n\nb', 60)).toBe(3);
  });
  test('短い文章は、1つのまま', () => {
    expect(chunkText('こんにちは', 60, 20)).toEqual(['こんにちは']);
    expect(chunkText('', 60, 20)).toEqual(['']);
  });
  test('3000字は、どの塊も maxLines に収まり、つなぐと元に戻る (文字を失わない)', () => {
    const text = Array.from({ length: 120 }, (_, i) => `行${i}`).join('\n') + '\n' + 'あ'.repeat(1500);
    const cs = chunkText(text, 60, 20);
    expect(cs.length).toBeGreaterThan(1);
    for (const c of cs) expect(wrappedLines(c, 60)).toBeLessThanOrEqual(20);
    expect(cs.join('\n').replace(/\n/g, '')).toBe(text.replace(/\n/g, ''));
  });
  test('改行のない3000字も、切れ目なく分かれる', () => {
    const t = 'い'.repeat(3000);
    const cs = chunkText(t, 60, 20);
    expect(cs.join('')).toBe(t);
    for (const c of cs) expect(c.length).toBeLessThanOrEqual(1200);
  });
});
