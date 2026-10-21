# ログイン確認ページ

学校のGoogleアカウントで Firebase Authentication にログインできるかを確認するだけの使い捨てページです。データは保存しません。本体のアプリを公開すると、同じ Hosting 上で置き換わります。

## 公開手順

1. Firebase プロジェクトを作成し、Authentication で Google ログインを有効にする。
2. `config.js` の `firebaseConfig` を、コンソールに表示された値に書き換える。
3. PC に Node.js を入れ、次を実行する。

```sh
npm install -g firebase-tools
firebase login                      # 学校のアカウントでログイン
firebase use --add                  # 作成したプロジェクトを選ぶ
firebase deploy --only hosting      # このフォルダ (login-check/) で実行
```

4. 表示された `https://<プロジェクトID>.web.app` を学生に送り、学校のアカウントで試してもらう。
5. 画面の「結果をコピー」で、成功・失敗の内容を送ってもらう。
