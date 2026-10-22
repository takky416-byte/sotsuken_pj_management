import { describe, expect, test } from 'vitest';
import { parseOutline } from './outline';

describe('parseOutline', () => {
  test('見出し・箇条書き・詳細', () => {
    const out = parseOutline([
      '# 要件定義',
      '- 機能一覧を作る',
      '  > 必須と追加に分ける',
      '  > 優先順位を付ける',
      '  - 洗い出す',
      '# 外部設計',
      '- 画面遷移図',
    ].join('\n'));
    expect(out).toEqual([
      { depth: 1, title: '要件定義', detail: '' },
      { depth: 2, title: '機能一覧を作る', detail: '必須と追加に分ける\n優先順位を付ける' },
      { depth: 3, title: '洗い出す', detail: '' },
      { depth: 1, title: '外部設計', detail: '' },
      { depth: 2, title: '画面遷移図', detail: '' },
    ]);
  });
  test('見出しなしの貼り付けは baseDepth から始まり、深すぎる階層は3にまとめる', () => {
    const out = parseOutline('a\n  b\n    c\n      d', 2);
    expect(out.map((n) => n.depth)).toEqual([2, 3, 3, 3]);
  });
  test('番号付き・全角の中黒・タブ・空行・CRLF', () => {
    const out = parseOutline('1. a\r\n\r\n\t・b', 1);
    expect(out.map((n) => [n.depth, n.title])).toEqual([[1, 'a'], [2, 'b']]);
  });
  test('階層の飛びを詰める', () => {
    expect(parseOutline('# a\n### b').map((n) => n.depth)).toEqual([1, 2]);
  });
});
