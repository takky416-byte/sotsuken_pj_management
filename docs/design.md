# 卒研進捗管理アプリ 設計書 (v0.1 / 2026-10-21)

前提は `docs/decisions.md`。この文書は、それを実装できる粒度に落としたもの。変更があれば両方を更新する。

## 1. 構成

| 項目 | 内容 |
|---|---|
| フロント | Vite + React + TypeScript (strict)。UIライブラリなし、素のCSS。日本語UI。PC優先でスマホ対応 |
| バックエンド | なし (Firestore + Security Rules を直接使う)。Cloud Functions・Storage は使わない (無料プランのため) |
| 認証 | Firebase Authentication の Google ログインのみ。`@trident.ac.jp` かつ `email_verified` かつ名簿 (roster) にあるアカウントだけがデータにアクセス可 |
| ホスティング | Firebase Hosting (`sotsuken-pj.web.app`)。SPA なので全パスを `index.html` に rewrite |
| デプロイ | GitHub Actions (手動実行)。ビルド → Hosting と Firestore ルールを公開。鍵は GitHub シークレット |
| 通知 | Apps Script + Gmail (運用開始後) |
| テスト | 純粋関数 (アウトライン解析、進捗計算、日付、フラグ) は vitest。Security Rules は Firestore エミュレータ (Java が使える場合) |

### ディレクトリ

```
app/                      本体
  src/
    main.tsx, App.tsx, firebase.ts
    auth/                 ログイン、名簿との照合、ロール判定
    lib/                  dates.ts outline.ts progress.ts flags.ts csv.ts
    data/                 Firestore の読み書き (hooks)
    features/
      student/            チーム画面、WBS、日報
      teacher/            ダッシュボード、チーム詳細、キックオフ、名簿、カレンダー、欠席、設定
      meeting/            共有ミーティング画面
    components/
  firestore.rules, firestore.indexes.json, firebase.json, .firebaserc
login-check/              ログイン確認ページ (本体公開後に不要なら削除)
docs/                     決定事項・設計書
```

既存の Express + SQLite の試作 (`server/`, `client/`) は、実装開始時に削除する。

## 2. データモデル (Firestore)

メールアドレスは `roster` にだけ置き、他のデータは `sid` (学生ID: `A1`〜`H4` のようなチーム記号+連番) で参照する。学生が他人のメールアドレスを読めないようにするため。

```
roster/{emailLower}            名簿。読めるのは本人と教員のみ
  name: string                 苗字 (同姓は鈴木秀・鈴木空のように1文字付ける)
  role: 'student' | 'teacher'
  teamId: 'A'..'H' | null
  sid: string | null

teams/{teamId}                 8件。teamId = 'A'..'H'
  members: [{sid, name}]       表示用 (名簿登録時に生成)
  status: 'planning' | 'active'
  projectName: string          採用企画名 (1行)
  proposals: [{no:1|2, title, adopted:boolean}]   企画名のみ。内容は保存しない
  driveUrl: string             共有DriveフォルダのURL
  kickoffAt: timestamp | null
  teamMeetingInput: boolean    ミーティング記録をチームが入力できるか (初期 false)

teams/{teamId}/tasks/{taskId}
  title, detail: string
  parentId: string | null, depth: 1|2|3, order: number (間に挿入できる実数)
  status: 'todo' | 'doing' | 'done' | 'hold'
  assignees: sid[], startDate, endDate: 'YYYY-MM-DD' | null
  links: [{url, label}]        http(s) のみ
  source: 'user' | 'draft'     draft = 叩き台 (印を表示)
  createdBy, updatedBy: sid or 'teacher', createdAt, updatedAt
  deleted: boolean, deletedAt   ソフトデリート

teams/{teamId}/dailyReports/{date}_{sid}
  sid, date: 'YYYY-MM-DD', dayKey: number (例 20261028)
  entries: [{kind:'task'|'study'|'discuss'|'other', taskId?, note}]
  blocker: string
  absent: boolean              教員のみ変更可
  submittedAt, updatedAt

teams/{teamId}/meetings/{date}
  decided: string, actions: [{text, done:boolean}], note: string (学生に公開)
  createdBy, updatedAt

teams/{teamId}/comments/{id}   学生に公開するコメント (教員が書く)
  target: {type:'task'|'meeting', id}, body, createdAt

config/classDays               { days: [{date, periods:'3-4'|'1-2', meeting:boolean, note}] }
config/settings                { peerDailyView: boolean (初期 true), rotateOrder: boolean }
milestones/{id}                { title, date, endDate?, teamId: string|null, note }  teamId=null が共通

teacherNotes/{id}              教員専用。{teamId, sid?, body, createdAt}
followups/{id}                 教員専用。面談などの記録 (運用開始後)
evaluationsRaw/{id}            教員専用。評価の元データ・評価者情報 (運用開始後)
evaluationsPublished/{teamId}  学生に公開する匿名集計 (運用開始後)
```

### 日付の扱い

- 日付はすべて日本時間の `YYYY-MM-DD` 文字列。日報には `dayKey` (年*10000+月*100+日) も持たせる。
- 日報の編集は、Security Rules で「`dayKey` が `request.time + 9時間` の日付と等しい」場合だけ許可する (提出した日のうちだけ編集可の担保)。

## 3. 権限 (Security Rules の方針)

共通の判定: `request.auth.token.email_verified == true` かつ email が `@trident.ac.jp` で終わり、`roster/{email}` が存在すること。ロールは roster の `role`。

| データ | 学生 | 教員 |
|---|---|---|
| roster | 自分の1件を読む | 全件読み書き |
| teams/{自チーム} | 読む。`driveUrl` 等は教員のみ書込 | 全チーム読み書き |
| tasks | 自チームのみ作成・更新 (削除は `deleted` を立てる) | 全チーム読み書き |
| dailyReports | 自分の分のみ作成・更新 (当日のみ、`absent` は変更不可)。同チームの閲覧は `peerDailyView` が true のとき | 全て読み書き (`absent` は教員のみ) |
| meetings | 自チームを読む。書込は `teamMeetingInput` が true のときだけ | 全て読み書き |
| comments | 自チームを読む | 書込 |
| config / milestones | 読む (チーム固有は自チームのみ) | 書込 |
| teacherNotes / followups / evaluationsRaw | **不可** | 読み書き |
| 他チームのデータ | **不可** | 可 |

- 書込時は、フィールドの型・長さ・列挙値 (`status` など)・`depth` の範囲を検証する。更新できるフィールドは `diff().affectedKeys()` で制限する。
- 学生には、他の人のメールアドレス・教員専用データ・他チームのデータが、クエリでも取得できないことをテストで確認する。

## 4. 画面

### 4.1 学生

| 画面 | パス | 内容 |
|---|---|---|
| ログイン | `/login` | 「Googleでログイン」。名簿にないアカウントは「名簿に登録されていません」と表示してログアウト |
| 初回の案内 | 初回ログイン時 | 教員が全チーム・全員の情報を見られること、教員専用メモがあること、何が記録されるかを表示 (確認して進む) |
| チーム | `/` | 企画名、共有フォルダを開くボタン、次のマイルストーン、メンバー、今日の日報の状況。キックオフ前は「企画検討中です」 |
| WBS | `/wbs` | 階層ツリー。1行入力で追加 (Enter)、Tab/Shift+Tab で階層変更、状態の切り替え、担当 (複数・空欄可)、期日、詳細欄 (開閉)、リンク。親の完了率は子から自動計算。削除はソフトデリートで「元に戻す」を数秒表示 (確認ダイアログなし)。一括貼り付け対応 |
| 日報 | `/daily` | 今日の分。自分が担当・進行中のタスクにチェック+一言、固定項目 (調査・勉強 / チームで相談 / その他)、困っていること (任意)。提出後も当日中は編集可。過去分は閲覧のみ。同チームの日報は設定がONなら閲覧可 |
| ミーティング | `/meeting/:teamId` | 共有ミーティング画面 (4.3) を学生も開ける |

### 4.2 教員

| 画面 | パス | 内容 |
|---|---|---|
| ダッシュボード | `/teacher` | 8チームの一覧。企画名、状態、次のマイルストーン、直近の授業日の日報提出 (n/m)、最終ミーティング日、要確認フラグ。クリックでチーム詳細 |
| チーム詳細 | `/teacher/team/:id` | タブ: WBS / 日報 (メンバー×授業日の表) / ミーティング / コメント / 教員メモ (専用)。WBS は学生と同じ操作が可能 |
| キックオフ | `/teacher/team/:id/kickoff` | 5項目 (5.1) |
| 欠席入力 | `/teacher/attendance` | 授業日を選ぶと、未提出の学生の一覧が出て、1タップで「欠席」にできる |
| 名簿登録 | `/teacher/roster` | CSV (苗字, メールアドレス, チーム) を貼り付け → プレビュー → 登録。教員自身は `role: teacher` で別途登録 |
| カレンダー | `/teacher/calendar` | 授業日の取り込み (CSV: 日付, 時限, 備考)、木曜のミーティング実施/なしの切り替え、共通・チーム固有のマイルストーン編集 |
| 設定 | `/teacher/settings` | `peerDailyView`、チームごとの `teamMeetingInput`、順番の回し方 |
| データ書き出し | `/teacher/export` | 全データの JSON と、主要データの CSV (バックアップ) |

### 4.3 共有ミーティング画面 (`/meeting/:teamId`)

学生と同じディスプレイに映す画面。**学生に見せてよいデータだけを読み込む** (`teacherNotes` などは購読しない)。スクロールなしで1画面に収めることを目標にする。

1. 前回のアクションの結果 (チェックで できた/できない)
2. 今週の活動: メンバー×授業日の表 (提出状況と触ったタスク)
3. WBS の進み具合: 全体の完了率、予定より遅れたタスク、次のマイルストーン
4. 困りごと (日報の「困っていること」の一覧)
5. 今日決めること: 決まったこと・次のアクション (入力できるのは教員。`teamMeetingInput` が true のチームは学生も可)

画面上部にチーム切り替え (A〜H) と、次のチームへのワンクリック。ミーティングを開いた時点で、その日の `meetings/{date}` を自動作成して「確認した」の記録にする。

## 5. 主要な機能の仕様

### 5.1 キックオフ

教員がチーム詳細で実行。再実行しても重複しない (idempotent)。

1. 採用企画名と、企画①②の名前 (採用/不採用) を記録する。
2. WBS が空なら、雛形の6大項目を作る: 企画の具体化 / 要件定義 / 外部設計 / 内部設計・実装 / テスト・検証 / 発表・展示準備 (それぞれ1〜2行の説明を詳細に入れる)。
3. 叩き台のタスクを取り込む (任意、5.2)。`source: 'draft'` にする。
4. `status` を `active`、`kickoffAt` を現在時刻にする。
5. 共有フォルダのURLを登録する (任意)。

### 5.2 アウトライン形式のインポート (WBSへの一括貼り付け・叩き台の取り込み)

```
# 大項目名            ← depth 1 (既存の同名大項目があれば、その下に追加)
- タスク              ← depth 2
  - サブタスク        ← depth 3
    > 詳細テキスト    ← 直前のタスクの詳細 (複数行可)
```

インデント2スペース (またはタブ) で階層を表す。4階層以上は3階層目にまとめる。プレビューで件数と階層を確認してから登録する。

### 5.3 進捗の計算

- 葉タスクの `done` の割合を完了率とし、親は子の完了率の平均ではなく、葉の合計から求める (`hold` は分母から除く)。
- 「遅れ」: `endDate` が過ぎていて `done` でない。

### 5.4 要確認フラグ (教員のみ表示、判定はクライアントで行う)

初期の条件 (設定で変更可能):
- 直近の授業日2回連続で、日報が未提出 (欠席は除く)。
- 担当者がいない・または全員が欠席中のタスクが、期限を過ぎている。
- 「困っていること」が2回連続で書かれている。

フラグは目安の表示だけで、評価や単位認定には使わない。

### 5.5 日報

- 提出の成立: 一言 (`note`) のあるエントリが1つ以上ある、または `blocker` が書かれている。選んだ項目の一言は必須 (画面で強制)。
- 授業日以外の入力は任意で可。未提出の判定は授業日だけ。
- 時間の記録欄は作らない。ランキング・回数の集計表示もしない。

## 6. 開発順序と日程

| フェーズ | 期間 | 内容 |
|---|---|---|
| 0 土台 | 10/22 | `app/` の雛形、Firebase 接続、ログインと名簿照合、Security Rules (テスト付き)、デプロイのワークフロー (本体+ルール) |
| 1 WBS | 10/23〜24 | WBS (ツリー、1行追加、階層、状態、詳細、リンク、ソフトデリート)、アウトラインのインポート、キックオフ、チーム画面、カレンダー・マイルストーンの表示、名簿登録 |
| 2 日報と教員画面 | 10/25〜26 | 日報、欠席入力、教員ダッシュボード、チーム詳細 → **10/26 試運転** |
| 3 修正と準備 | 10/27 | 試運転の修正、名簿・授業日の登録、学生への案内の文面、叩き台の作成 (夜) |
| 4 運用開始 | 10/28 | 午前: 叩き台の取り込みとキックオフ → 3限から運用。夜: 共有ミーティング画面 |
| 5 運用開始後 | 10/29〜 | 公開コメント・教員メモ、リマインド (Apps Script)、評価CSV、データ書き出し、要確認フラグの調整 |

最低限の完成ラインは、フェーズ2までと、10/28夜までの共有ミーティング画面。間に合わない場合は、コメント・教員メモ・フラグを後ろに回す。

## 7. 非機能

- セキュリティ: 全データの表示は React のエスケープに任せ、`dangerouslySetInnerHTML` は使わない。リンクは `http(s)` のみ許可。Security Rules が唯一の権限境界で、画面側の隠蔽に頼らない。
- 読み取り量: 無料枠 (1日5万回) に収める。ダッシュボードは直近の授業日の日報とタスクだけを読む。一覧は購読 (onSnapshot) を必要な画面だけに限る。
- アクセシビリティ・UI: 確認ダイアログは極力出さない (元に戻す方式)。過剰な装飾・アニメーションなし。ダークモード対応。
- 運用: 鍵は運用が落ち着いたら削除。バックアップは教員画面の書き出し (月1回目安)。

## 8. 未決・要確認

- 要確認フラグの閾値 (5.4 の初期値でよいか)。
- 12/10 と 1/28 の木曜ミーティングの扱い (カレンダーで「なし」にする想定)。
- 卒業後のデータの扱い、バックアップの頻度。
- 議事録の録音取り込み (運用開始後)。
