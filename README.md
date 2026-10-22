# 卒研PJ管理システム

専門学校の卒業研究 (チーム制作) の進捗を、WBS・日報・週1回のミーティング画面で把握するための Web アプリ。

- 決定事項: `docs/decisions.md`
- 設計書: `docs/design.md`

## 開発

```sh
cd app
npm ci
npm run dev           # 開発サーバー (本番の Firebase に接続する)
npm run typecheck
npm test              # 純粋関数のテスト
npm run test:rules    # Security Rules のテスト (Firestore エミュレータ。Java が必要)
npm run build
```

## デプロイ

GitHub Actions を手動で実行する (リポジトリのシークレット `FIREBASE_SERVICE_ACCOUNT` が必要)。

- `Seed initial data`: 初回のみ。教員の名簿とチーム A〜H を作る。
- `Deploy app`: テスト → ビルド → Hosting と Firestore ルールを公開する。
