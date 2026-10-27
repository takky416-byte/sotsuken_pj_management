# 操作マニュアル・説明資料・デモ動画 (学生編)

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

写真・動画は、テスト用の**架空のデータ**で、実際のアプリを自動で操作して作っています(学生名・企画名は架空です)。音声はなく、字幕つきです。

## 作り直す(アプリを変えたあと)

```
cd app
PW_CHROMIUM=/opt/pw-browsers/chromium npm run manual
```

- 画面写真と動画は `app/manual/capture.spec.ts` と `app/manual/demo.spec.ts`、データは `app/manual/seed.ts`、文章は `app/manual/content.json` にあります。
- 必要なもの: Java(エミュレータ)、ffmpeg、Python の `python-pptx`、Pillow。
- 画面のボタン名を変えたときは、`capture.spec.ts` と `demo.spec.ts` の探し方も直してください(見つからないと、失敗して分かります)。
- 動画の録画に Playwright の ffmpeg が使えない環境では、システムの ffmpeg を `ffmpeg-<版>/ffmpeg-linux` として置いてください。
