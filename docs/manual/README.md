# 操作マニュアル・説明資料・デモ動画 (学生編・教員編)

| ファイル | 内容 |
|---|---|
| `卒研PJ管理_操作マニュアル_学生編.pdf` | 画面写真つきの操作マニュアル (A4、印刷できます) |
| `卒研PJ管理_操作マニュアル_学生編.html` | 同じ内容。ブラウザで開けます。同じフォルダの動画を再生できます |
| `卒研PJ管理_説明資料_学生編.pptx` | 説明会などで使うスライド。デモ動画も、スライドに入っています |
| `demo-1-daily.mp4` | 作業ログを送る |
| `demo-2-wbs.mp4` | WBS・ガントチャートを見る・直す |
| `demo-3-pj.mp4` | PJ分析とミーティング |
| `demo-4-start.mp4` | はじめて使うとき(ログイン・ガイド) |
| `demo-5-review.mp4` | 初期WBSの見直し(キックオフのあと) |
| `卒研PJ管理_操作マニュアル_教員編.pdf` / `.html` | **教員編**の操作マニュアル (ダッシュボード・チーム詳細・キックオフ・ミーティング・利用状況・PJ分析・設定) |
| `卒研PJ管理_説明資料_教員編.pptx` | **教員編**の説明会用スライド (43枚)。教員向けデモ動画も入っています。無料枠・数の見方のスライドつき |
| `demo-t-1-dashboard.mp4` | (教員編) ダッシュボードで要確認を見つける |
| `demo-t-2-usage.mp4` | (教員編) 利用状況で関与・貢献を数で見る |
| `demo-t-3-kickoff.mp4` | (教員編) キックオフ |
| `demo-t-4-meeting.mp4` | (教員編) ミーティングと欠席 |
| `demo-t-5-settings.mp4` | (教員編) 設定 (カレンダー・叩き台・バックアップ) |

写真・動画は、テスト用の**架空のデータ**で、実際のアプリを自動で操作して作っています(学生名・企画名は架空です)。音声はなく、字幕つきです。

## 作り直す(アプリを変えたあと)

```
cd app
PW_CHROMIUM=/opt/pw-browsers/chromium npm run manual
```

- 学生編: 画面写真と動画は `app/manual/capture.spec.ts` と `app/manual/demo.spec.ts`、文章は `app/manual/content.json`。教員編: `app/manual/capture-teacher.spec.ts` と `app/manual/demo-teacher.spec.ts`、文章は `app/manual/content-teacher.json`。データ(両方とも架空)は `app/manual/seed.ts`。説明資料(pptx)は、学生編・教員編とも `app/manual/build_pptx.py` で作ります(`EDITION=teacher` で教員編)。
- 必要なもの: Java(エミュレータ)、ffmpeg、Python の `python-pptx`、Pillow。
- 画面のボタン名を変えたときは、`capture.spec.ts` と `demo.spec.ts` の探し方も直してください(見つからないと、失敗して分かります)。
- 動画の録画に Playwright の ffmpeg が使えない環境では、システムの ffmpeg を `ffmpeg-<版>/ffmpeg-linux` として置いてください。
