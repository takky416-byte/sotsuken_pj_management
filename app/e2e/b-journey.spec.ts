import { expect, test } from '@playwright/test';
import { login, row } from './helpers';
import { today } from './dates';

const TEACHER = 'teacher@trident.ac.jp';
const A1 = 'a1@trident.ac.jp';
const A2 = 'a2@trident.ac.jp';

// 運用の流れに沿って、前のテストの結果を引き継ぐ (同じエミュレータのデータを使う)
test.describe.serial('運用の流れ', () => {
  test('キックオフ前: 学生は「企画検討中」と表示され、WBS・日報は使えない', async ({ page }) => {
    await login(page, A1);
    await expect(page.getByText('企画検討中です。キックオフをお待ちください。')).toBeVisible();
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await expect(page.getByText('企画検討中です')).toBeVisible();
    await page.getByRole('link', { name: '日報', exact: true }).click();
    await expect(page.getByText('キックオフ後に日報を書けるようになります')).toBeVisible();
  });

  test('教員がキックオフすると、雛形と叩き台ができる。再実行しても増えない', async ({ page }) => {
    await login(page, TEACHER);
    await page.goto('/teacher/kickoff/A');
    await page.getByLabel('採用する企画名').fill('テスト企画');
    await page.getByLabel(/叩き台のタスク/).fill('# 要件定義\n- 機能一覧を作る\n  > 必須機能と追加機能に分ける');
    await expect(page.getByText('タスクを7件作成します')).toBeVisible();
    await page.getByRole('button', { name: 'キックオフする' }).click();
    await expect(page.getByText(/タスクを7件作成しました/)).toBeVisible();

    // 2回目 (同じ内容) は、新しく作られない
    await page.getByLabel(/叩き台のタスク/).fill('# 要件定義\n- 機能一覧を作る');
    await expect(page.getByText('タスクを0件作成します')).toBeVisible();

    await page.goto('/teacher/team/A');
    await expect(page.getByText('テスト企画')).toBeVisible();
    for (const t of ['企画の具体化', '要件定義', '外部設計', '内部設計・実装', 'テスト・検証', '発表・展示準備', '機能一覧を作る']) {
      await expect(row(page, t)).toBeVisible();
    }
    await expect(row(page, '機能一覧を作る').getByText('叩き台')).toBeVisible();
    await expect(row(page, '要件定義').getByText('叩き台')).toHaveCount(0); // 雛形は叩き台ではない
  });

  test('学生: WBS でタスクを追加・階層変更・状態・担当・削除と元に戻す', async ({ page }) => {
    await login(page, A1);
    await expect(page.getByText('テスト企画')).toBeVisible();
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();

    // 追加 (Enter)
    const add = page.getByPlaceholder(/^タスクを追加/);
    await add.fill('ログイン画面を作る');
    await add.press('Enter');
    await expect(row(page, 'ログイン画面を作る')).toBeVisible();
    await add.fill('画面遷移図を描く');
    await add.press('Enter');
    await expect(row(page, '画面遷移図を描く')).toBeVisible();

    // 階層変更 (Tab): 直前のタスクの子になる
    await row(page, '画面遷移図を描く').getByRole('textbox', { name: 'タイトル' }).press('Tab');
    await expect(page.locator('.wbs-row.depth-2', { has: page.locator('input[value="画面遷移図を描く"]') })).toBeVisible();

    // 子タスクの追加 (＋)
    await row(page, '外部設計').getByRole('button', { name: '子タスクを追加' }).click();
    await page.getByPlaceholder(/の下に追加/).fill('ワイヤーフレームを作る');
    await page.getByPlaceholder(/の下に追加/).press('Enter');
    await expect(row(page, 'ワイヤーフレームを作る')).toBeVisible();

    // 状態・担当・終了日・詳細は、子のない (葉の) タスクで操作する。
    // 親タスク (ここでは「ログイン画面を作る」) は、担当を付けず、状態は子から自動で決まる
    const parent = row(page, 'ログイン画面を作る');
    await expect(parent.getByLabel('状態', { exact: true })).toHaveCount(0);
    await expect(parent.getByLabel('状態(自動)')).toContainText('未着手');
    const t = row(page, '画面遷移図を描く');
    await t.getByLabel('状態', { exact: true }).selectOption('doing');
    await expect(parent.getByLabel('状態(自動)')).toContainText('進行中'); // 子が進行中になると、親も進行中
    await parent.getByRole('button', { name: '詳細' }).click();
    await expect(page.getByText('親タスクには、担当を付けません')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '岩田' })).toHaveCount(0);
    await parent.getByRole('button', { name: '詳細' }).click();
    await t.getByRole('button', { name: '詳細' }).click();
    await expect(page.getByLabel('終了日')).toBeVisible(); // 詳細が開く
    await page.getByRole('checkbox', { name: '岩田' }).click(); // Firestore に保存されてから反映される
    await expect(page.getByRole('checkbox', { name: '岩田' })).toBeChecked();
    await page.getByLabel('終了日').fill('2030-01-01');
    const memo = page.locator('.detail textarea');
    await memo.fill('メモ: パスワードは使わない');
    await memo.blur();

    // 削除 → 元に戻す
    await page.getByRole('button', { name: '削除', exact: true }).click();
    await expect(row(page, '画面遷移図を描く')).toHaveCount(0);
    await expect(parent.getByLabel('状態', { exact: true })).toHaveValue('todo'); // 子がなくなると、子のないタスクとして、自分の状態 (選べる) に戻る
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(row(page, '画面遷移図を描く')).toBeVisible();

    // 再読み込みしても残っている (保存されている)
    await page.reload();
    await expect(row(page, '画面遷移図を描く').getByLabel('状態', { exact: true })).toHaveValue('doing');
    await row(page, '画面遷移図を描く').getByRole('button', { name: '詳細' }).click();
    await expect(page.getByRole('checkbox', { name: '岩田' })).toBeChecked();
  });

  test('学生: 日報は、結果と説明 (10字以上) と次にやることがないと提出できない。提出後も、今日は直せる。タスクの状態も更新される', async ({ page }) => {
    await login(page, A1);
    await page.getByRole('link', { name: '日報', exact: true }).click();
    await expect(page.getByRole('heading', { name: '日報', exact: true })).toBeVisible();

    // 今日自分が更新したタスク (この流れで作ったもの) は、「進んだ」で先に入っている。説明がまだなので、足りない点が出る
    const submit = page.getByRole('button', { name: '日報を提出する' });
    const card = page.locator('.dcard', { hasText: '画面遷移図を描く' });
    await expect(card.getByRole('button', { name: '進んだ' })).toHaveAttribute('aria-pressed', 'true');
    await submit.click();
    await expect(page.getByRole('alert')).toContainText('画面遷移図を描くの説明を、もう少し具体的に');
    await expect(page.getByRole('alert')).toContainText('「次にやること」');

    // 説明が短いと、まだ足りない (「もう少し具体的に」と出る。字数は見せない)
    await page.getByLabel('画面遷移図を描くの説明').fill('下書きを作った');
    await card.getByLabel('画面遷移図を描くの説明').blur();
    await expect(card).toContainText('もう少し具体的に');
    await expect(card).not.toContainText('あと3字');
    await page.getByLabel('画面遷移図を描くの説明').fill('画面の下書きを3枚作った');
    await expect(card).not.toContainText('もう少し具体的に');
    // ほかにも今日更新したタスク (ワイヤーフレーム) が、先に入っている。説明を書くか、「進んだ」を押して外す
    await page.getByLabel('ワイヤーフレームを作るの説明').fill('枠線の配置を決めて、1枚目を描いた');
    await page.getByLabel('次にやること', { exact: true }).fill('下書きをレビューして、清書する');
    // 「完了した」を選ぶと、提出でタスクも完了になる
    await card.getByRole('button', { name: '完了した' }).click();
    await submit.click();
    await expect(page.getByText('提出しました。今日のうちは')).toBeVisible();

    // 再読み込み → 「日報を更新する」になり、内容も残る。直して更新できる
    await page.reload();
    const update = page.getByRole('button', { name: '日報を更新する' });
    await expect(update).toBeVisible();
    await expect(page.getByLabel('画面遷移図を描くの説明')).toHaveValue('画面の下書きを3枚作った');
    await expect(page.getByLabel('次にやること', { exact: true })).toHaveValue('下書きをレビューして、清書する');
    await page.getByLabel('画面遷移図を描くの説明').fill('画面の下書きを3枚作り、レビューした');
    await update.click();
    await expect(page.getByText('提出しました。今日のうちは')).toBeVisible();
    await expect(page.locator('.feed').getByText('画面の下書きを3枚作り、レビューした')).toBeVisible();
    await expect(page.locator('.feed').getByText('次にやること: 下書きをレビューして、清書する')).toBeVisible();

    // タスクが完了になっている (WBS)
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await expect(row(page, '画面遷移図を描く').getByLabel('状態', { exact: true })).toHaveValue('done');
  });

  test('学生: 同じチームの日報は見える。他のチームのミーティング画面には入れない', async ({ page }) => {
    await login(page, A2);
    await page.getByRole('link', { name: '日報', exact: true }).click();
    await expect(page.locator('.feed').getByText('画面の下書きを3枚作り、レビューした')).toBeVisible(); // 岩田さんの日報

    await page.goto('/meeting/B');
    await expect(page).toHaveURL(/\/meeting\/A$/);
    await expect(page.getByRole('heading', { name: /^Aチーム/ })).toBeVisible();
  });

  test('教員: ダッシュボードに提出人数が出て、欠席を入力すると反映される', async ({ page }) => {
    await login(page, TEACHER);
    const aRow = page.locator('tr', { has: page.getByRole('link', { name: 'A', exact: true }) });
    await expect(aRow).toContainText('1/2'); // 岩田のみ提出

    await page.getByRole('link', { name: '欠席' }).click();
    const card = page.locator('.card', { hasText: 'Aチーム' });
    await card.locator('li', { hasText: '近内' }).getByRole('button', { name: '欠席にする' }).click();
    await expect(card.locator('li', { hasText: '近内' })).toContainText('欠席');

    await page.getByRole('link', { name: 'チーム', exact: true }).click();
    await expect(aRow).toContainText('2/2'); // 欠席は未提出に数えない
  });

  test('教員メモは学生に見えない。教員のコメントは学生に見える', async ({ browser }) => {
    const t = await (await browser.newContext()).newPage();
    await login(t, TEACHER);
    await t.goto('/teacher/team/A');
    await t.getByRole('button', { name: '教員メモ(専用)' }).click();
    await t.getByPlaceholder(/^メモ/).fill('内密のメモ: 要フォロー');
    await t.getByRole('button', { name: 'メモを追加' }).click();
    // 保存が終わる前は、入力欄にも同じ文字が残っているので、一覧のメモだけを指定する
    await expect(t.locator('.memo', { hasText: '内密のメモ: 要フォロー' })).toBeVisible();
    await expect(t.getByPlaceholder(/^メモ/)).toHaveValue(''); // サーバーへの保存が終わると、入力欄が空になる

    await t.goto('/meeting/A');
    await t.locator('.step').nth(3).click();
    await t.getByPlaceholder('学生にも見えるコメント').fill('よく進んでいます');
    await t.getByRole('button', { name: '送信' }).click();
    await expect(t.getByText('よく進んでいます')).toBeVisible();
    await expect(t.getByText('内密のメモ')).toHaveCount(0); // 共有画面には出ない

    const s = await (await browser.newContext()).newPage();
    await login(s, A1);
    await s.goto('/meeting/A');
    await s.locator('.step').nth(3).click();
    await expect(s.getByText('よく進んでいます')).toBeVisible();
    await expect(s.getByText('内密のメモ')).toHaveCount(0);
    await s.goto('/');
    await expect(s.getByText('内密のメモ')).toHaveCount(0);
  });

  test('ミーティング画面: 前回のアクション、今週の活動、今日の記録 (教員のみ入力)', async ({ browser }) => {
    const t = await (await browser.newContext()).newPage();
    await login(t, TEACHER);
    await t.goto('/meeting/A');
    const goStep = (page: typeof t, n: number) => page.locator('.step').nth(n).click();
    await expect(t.getByRole('heading', { name: '進捗確認会議の進め方' })).toBeVisible();
    await expect(t.getByRole('heading', { name: /前回のアクション/ })).toBeVisible();
    await expect(t.getByText('設計を進める')).toBeVisible();
    await expect(t.getByText('前回決めたこと: 前回の決定')).toBeVisible();
    await goStep(t, 1);
    await expect(t.getByRole('heading', { name: /事実の確認/ })).toBeVisible();
    await expect(t.locator('table.facts')).toContainText('岩田');
    await expect(t.getByRole('heading', { name: /今週の活動/ })).toBeVisible();
    await expect(t.locator('.matrix')).toContainText('岩田');
    await goStep(t, 2);
    await expect(t.getByRole('heading', { name: '手待ちの人と、タスクの振り分け' })).toBeVisible();

    await goStep(t, 0);
    await t.getByRole('checkbox', { name: '設計を進める' }).click();
    await expect(t.getByRole('checkbox', { name: '設計を進める' })).toBeChecked();
    await goStep(t, 3);
    await expect(t.getByText('(記録済み)')).toBeVisible(); // ミーティング日に開くと、確認した記録ができる
    await t.getByLabel('決まったこと').fill('画面を先に作る');
    await t.getByLabel('決まったこと').blur();
    const input = t.getByPlaceholder('やることを入力して Enter');
    await input.fill('ワイヤーフレームを完成させる');
    await input.press('Enter');
    await expect(t.getByText('ワイヤーフレームを完成させる')).toBeVisible();
    await t.waitForTimeout(1500); // サーバーへの保存が終わる前に再読み込みすると、画面だけの変更が消える

    await t.reload(); // 保存されている
    await goStep(t, 3);
    await expect(t.getByLabel('決まったこと')).toHaveValue('画面を先に作る');
    await expect(t.getByText('ワイヤーフレームを完成させる')).toBeVisible();
    await goStep(t, 0);
    await expect(t.getByRole('checkbox', { name: '設計を進める' })).toBeChecked();

    // 学生は、記録を入力できない (設定が許可していないチーム)
    const s = await (await browser.newContext()).newPage();
    await login(s, A1);
    await s.goto('/meeting/A');
    await goStep(s, 3);
    await expect(s.getByText('ワイヤーフレームを完成させる')).toBeVisible();
    await expect(s.getByPlaceholder('やることを入力して Enter')).toHaveCount(0);
    await expect(s.getByText('記録は先生が入力します')).toBeVisible();
  });

  test('教員: 学生の画面のプレビューは、閲覧のみで操作できない', async ({ page }) => {
    await login(page, TEACHER);
    await page.getByRole('link', { name: '学生の画面' }).click();
    await page.getByLabel('学生を選ぶ').selectOption('A1');
    await expect(page.locator('.preview-frame')).toContainText('岩田');
    await page.locator('.preview-head').getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await expect(page.getByPlaceholder(/^タスクを追加/)).toBeDisabled();
    await page.locator('.preview-head').getByRole('link', { name: '日報', exact: true }).click();
    await expect(page.getByRole('button', { name: /日報を(提出|更新)する/ })).toBeDisabled();
  });

  test('設定: 日報のチーム内閲覧をオフにすると、学生は自分の分だけが見える', async ({ browser }) => {
    const t = await (await browser.newContext()).newPage();
    await login(t, TEACHER);
    await t.getByRole('link', { name: '設定' }).click();
    await t.getByLabel('同じチームの日報を、チームのメンバーどうしで見られるようにする').click();
    await expect(t.getByLabel('同じチームの日報を、チームのメンバーどうしで見られるようにする')).not.toBeChecked();

    const s = await (await browser.newContext()).newPage();
    await login(s, A2); // 近内さんは今日は欠席で、日報なし。岩田さんの日報は見えない
    await s.getByRole('link', { name: '日報', exact: true }).click();
    await expect(s.getByText('自分の日報')).toBeVisible();
    await expect(s.getByText('画面の下書きを3枚作り、レビューした')).toHaveCount(0);
  });

  test('日報の運用開始日の設定: 開始前の学生には「日報は〜から始まります」と出る', async ({ page }) => {
    await login(page, TEACHER);
    await page.getByRole('link', { name: '設定' }).click();
    const d = page.getByLabel('日報の運用開始日');
    await expect(d).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    // 運用開始日を明日にすると、学生には「始まります」の案内が出る
    const tomorrow = new Date(Date.parse(`${today()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    await d.fill(tomorrow);
    await expect(d).toHaveValue(tomorrow);
    await page.waitForTimeout(1000); // サーバーへの保存を待つ (すぐに再読み込みすると、書き込みが中断される)
    await page.reload();
    await expect(page.getByLabel('日報の運用開始日')).toHaveValue(tomorrow);

    const s = await (await page.context().browser()!.newContext()).newPage();
    await login(s, A1);
    await s.getByRole('link', { name: '日報', exact: true }).click();
    await expect(s.getByText(/日報は .* から始まります/)).toBeVisible();
  });
});
