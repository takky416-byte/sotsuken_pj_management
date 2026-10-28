import { describe, expect, test } from 'vitest';
import { filterOptions } from './TaskPicker';

const o = [{ id: '1', label: '要件定義 › 機能要件の一覧を作る' }, { id: '2', label: '外部設計 › 画面レイアウトを描く' }, { id: '3', label: '外部設計 › ER図を描く' }];

describe('filterOptions', () => {
  test('部分一致。空なら全部。空白で区切ると、すべてを含むもの。全角・半角・大文字小文字は区別しない', () => {
    expect(filterOptions(o, '').map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(filterOptions(o, '描く').map((x) => x.id)).toEqual(['2', '3']);
    expect(filterOptions(o, '外部 er').map((x) => x.id)).toEqual(['3']);
    expect(filterOptions(o, 'ＥＲ図').map((x) => x.id)).toEqual(['3']);
    expect(filterOptions(o, '存在しない')).toEqual([]);
  });
});
