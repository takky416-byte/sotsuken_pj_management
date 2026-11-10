import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Markdown の入力欄: 道具の列・ショートカット・箇条書きの続き・字下げ・貼り付け。表・チェックリスト・リンクのカードの表示。
test.describe.serial('Markdown の入力欄', () => {
  test('学生の作業ログ: 道具の列・ショートカット・箇条書きの続き・字下げ・URLの貼り付けができる', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await page.getByRole('button', { name: '＋ 調査・勉強' }).click().catch(() => undefined);
    const note = page.getByLabel('調査・勉強の説明');
    await note.fill('');
    await expect(page.getByRole('toolbar', { name: '書式' }).first()).toBeVisible(); // 書いている間は、道具の列が出る
    await page.screenshot({ path: 'e2e-shots/editor-toolbar.png' });
    // 太字: 選んで Ctrl+B。もう一度で外れる
    await note.fill('参考にした');
    await note.selectText();
    await note.press('Control+b');
    await expect(note).toHaveValue('**参考にした**');
    await note.press('Control+b');
    await expect(note).toHaveValue('参考にした');
    // 道具の列: 箇条書き → Enter で続き → 空の項目で Enter すると終わる
    await note.fill('');
    await page.getByRole('button', { name: '箇条書き' }).first().click();
    await expect(note).toHaveValue('- ');
    await note.pressSequentially('一つ目');
    await note.press('Enter');
    await expect(note).toHaveValue('- 一つ目\n- ');
    await note.pressSequentially('二つ目');
    await note.press('Tab'); // 字下げ
    await expect(note).toHaveValue('- 一つ目\n  - 二つ目');
    await note.press('Enter');
    await note.press('Enter'); // 空の項目で Enter: 記号が消える
    await expect(note).toHaveValue('- 一つ目\n  - 二つ目\n  ');
    // チェックリスト・Enter で次のチェックボックス
    await note.fill('');
    await page.getByRole('button', { name: 'チェックリスト' }).first().click();
    await note.pressSequentially('調べる');
    await note.press('Enter');
    await expect(note).toHaveValue('- [ ] 調べる\n- [ ] ');
    // 表・コード
    await note.fill('');
    await page.getByRole('button', { name: '表', exact: true }).first().click();
    await expect(note).toHaveValue(/^\| 項目 \| 内容 \|\n\| --- \| --- \|\n/);
    await note.fill('');
    await page.getByRole('button', { name: 'コード' }).first().click();
    await expect(note).toHaveValue('```\nコード\n```\n');
    // URL を貼り付けると、選んだ文字のリンクになる
    await note.fill('参考サイト');
    await note.selectText();
    await page.evaluate(() => navigator.clipboard.writeText('https://example.com/ref'));
    await note.press('Control+v');
    await expect(note).toHaveValue('[参考サイト](https://example.com/ref)');
    // 元に戻せる
    await note.press('Control+z');
    await expect(note).not.toHaveValue('[参考サイト](https://example.com/ref)');
    // 色の指定を書くと、入力欄の下に色見本が出る
    await note.fill('主な色は #ff8800 と rgb(0, 128, 255)');
    await expect(page.locator('.md-colors .swatch')).toHaveCount(2);
    await expect(page.locator('.md-colors')).toContainText('#ff8800');
  });

  test('教員の連絡事項: 表・チェックリスト・リンクのカードが、プレビューに出る', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    const field = page.getByLabel('Aチームへの連絡事項');
    await field.fill([
      '提出物です',
      'https://drive.google.com/drive/folders/abc123',
      'https://docs.google.com/document/d/doc123/edit',
      'https://example.com/ref',
      '',
      '- [ ] 申請を出す',
      '- [x] 確認した',
      '  - 入れ子',
      '',
      '| 項目 | 期限 |',
      '| --- | ---: |',
      '| 機材 | 11/5 |',
      '',
      '色は #ff0000 と `#0af`',
    ].join('\n'));
    await page.getByText('学生の画面での見え方').click();
    const prev = page.locator('.msg-preview');
    await expect(prev.locator('.link-card')).toHaveCount(3);
    await expect(prev.locator('.link-card').first()).toContainText('Googleドライブのフォルダ');
    await expect(prev.locator('.link-card').nth(1)).toContainText('Googleドキュメント');
    await expect(prev.locator('.link-card').nth(2)).toContainText('example.com');
    await expect(prev.locator('.md-box')).toHaveCount(2);
    await expect(prev.locator('.md-table th')).toHaveText(['項目', '期限']);
    await expect(prev.locator('.md-table td')).toHaveText(['機材', '11/5']);
    await expect(prev.locator('.msg-text .swatch')).toHaveCount(2); // 色の指定は、色見本つきで出る
  });
});
