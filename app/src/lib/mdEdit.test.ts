import { describe, expect, test } from 'vitest';
import { codeBlock, continueList, indent, insertTable, linkOf, pasteLink, toggleLines, wrap } from './mdEdit';

describe('wrap (太字・斜体など)', () => {
  test('選択を囲む。もう一度で外す', () => {
    expect(wrap('abc def', 0, 3, '**')).toEqual({ value: '**abc** def', start: 2, end: 5 });
    expect(wrap('**abc** def', 2, 5, '**')).toEqual({ value: 'abc def', start: 0, end: 3 });
    expect(wrap('**abc** def', 0, 7, '**').value).toBe('abc def');
  });
  test('選択がなければ、記号と仮の文字を入れて、仮の文字を選ぶ', () => {
    expect(wrap('', 0, 0, '**')).toEqual({ value: '**文字**', start: 2, end: 4 });
  });
});

describe('toggleLines (行頭の記号)', () => {
  test('箇条書き: 複数行に付ける。もう一度で外す', () => {
    const a = toggleLines('a\nb', 0, 3, 'ul');
    expect(a.value).toBe('- a\n- b');
    expect(toggleLines(a.value, a.start, a.end, 'ul').value).toBe('a\nb');
  });
  test('番号つきは、1. 2. と振る。チェックリスト・見出し・引用', () => {
    expect(toggleLines('a\nb', 0, 3, 'ol').value).toBe('1. a\n2. b');
    expect(toggleLines('やる', 0, 2, 'check').value).toBe('- [ ] やる');
    expect(toggleLines('題', 0, 1, 'h').value).toBe('## 題');
    expect(toggleLines('引用', 0, 2, 'quote').value).toBe('> 引用');
  });
  test('ほかの記号が付いていれば、置き換える。字下げは残す', () => {
    expect(toggleLines('- a', 0, 3, 'check').value).toBe('- [ ] a');
    expect(toggleLines('  - a', 0, 5, 'ol').value).toBe('  1. a');
  });
  test('空の入力欄でも、記号を付けられる (箇条書きを始める)', () => {
    expect(toggleLines('', 0, 0, 'ul')).toEqual({ value: '- ', start: 2, end: 2 }); // カーソルは、記号のあと (続けて書ける)
    expect(toggleLines('', 0, 0, 'check').value).toBe('- [ ] ');
  });
  test('カーソルだけでも、その行に付く。空行は飛ばす', () => {
    expect(toggleLines('x\ny', 2, 2, 'ul').value).toBe('x\n- y');
    expect(toggleLines('a\n\nb', 0, 4, 'ul').value).toBe('- a\n\n- b');
  });
});

describe('continueList (Enter)', () => {
  test('箇条書き・番号・チェックリストは、次の行に続く', () => {
    expect(continueList('- a', 3, 3)).toEqual({ value: '- a\n- ', start: 6, end: 6 });
    expect(continueList('1. a', 4, 4)?.value).toBe('1. a\n2. ');
    expect(continueList('- [x] a', 7, 7)?.value).toBe('- [x] a\n- [ ] ');
    expect(continueList('  - a', 5, 5)?.value).toBe('  - a\n  - ');
    expect(continueList('> a', 3, 3)?.value).toBe('> a\n> ');
  });
  test('空の項目で Enter すると、記号が消えて終わる', () => {
    expect(continueList('- a\n- ', 6, 6)).toEqual({ value: '- a\n', start: 4, end: 4 });
  });
  test('ふつうの行・選択中・記号より前のカーソルは、ふつうの Enter', () => {
    expect(continueList('abc', 3, 3)).toBeNull();
    expect(continueList('- a', 0, 3)).toBeNull();
    expect(continueList('- a', 1, 1)).toBeNull();
  });
  test('途中で Enter すると、後ろの文字が次の項目に移る', () => {
    expect(continueList('- ab', 3, 3)?.value).toBe('- a\n- b');
  });
});

describe('indent (Tab)', () => {
  test('2文字ぶん字下げ・字上げ。複数行にも効く', () => {
    expect(indent('- a', 3, 3, false)).toEqual({ value: '  - a', start: 5, end: 5 });
    expect(indent('  - a', 5, 5, true).value).toBe('- a');
    expect(indent('- a\n- b', 0, 7, false).value).toBe('  - a\n  - b');
    expect(indent('x', 1, 1, true).value).toBe('x'); // 外せないときは、そのまま
  });
});

describe('コード・表・リンク・貼り付け', () => {
  test('コードのかたまり', () => {
    expect(codeBlock('', 0, 0).value).toBe('```\nコード\n```\n');
    expect(codeBlock('abc', 0, 3).value).toBe('```\nabc\n```\n');
  });
  test('表の雛形は、空行をあけて入れる', () => {
    expect(insertTable('', 0).value.startsWith('| 項目 | 内容 |\n| --- | --- |')).toBe(true);
    expect(insertTable('前の文', 3).value.startsWith('前の文\n\n| 項目')).toBe(true);
  });
  test('リンク: 選んだ文字を [文字](https://) にして、URL を選ぶ', () => {
    expect(linkOf('参考', 0, 2)).toEqual({ value: '[参考](https://)', start: 5, end: 13 });
  });
  test('URL を貼り付けると、選んだ文字のリンクになる。選んでいなければ、ふつうの貼り付け', () => {
    expect(pasteLink('参考', 0, 2, 'https://example.com/a')?.value).toBe('[参考](https://example.com/a)');
    expect(pasteLink('参考', 2, 2, 'https://example.com/a')).toBeNull();
    expect(pasteLink('参考', 0, 2, 'ただの文')).toBeNull();
  });
});
