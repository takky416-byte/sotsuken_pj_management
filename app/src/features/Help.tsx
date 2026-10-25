import { ScreenMock } from '../components/ScreenMock';
import { helpFor } from '../lib/helpContent';
import { ThemePicker } from '../components/ThemePicker';
import { scenesFor } from '../lib/guideTone';
import { useNarrow } from '../lib/useNarrow';
import { useTone } from '../lib/tone';

const Q = ({ q, children }: { q: string; children: React.ReactNode }) => (
  <details className="card"><summary><strong>{q}</strong></summary><div className="form">{children}</div></details>
);

/** 使い方。学生用と教員用で内容を分ける。 */
export function Help({ role }: { role: 'student' | 'teacher' }) {
  return role === 'student' ? <StudentHelp /> : <TeacherHelp />;
}

/** **太字** を <strong> にする */
const inline = (t: string): React.ReactNode =>
  t.split('**').map((x, i) => (i % 2 === 1 ? <strong key={i}>{x}</strong> : x));

/** 「困ったとき」に、先に見せる場面 (残りは、右上の「ガイド」の「こんなとき」にある) */
const QUICK_SCENES = ['adhoc', 'stuck', 'missed', 'free', 'plan', 'report'];

function StudentHelp() {
  const tone = useTone();
  const narrow = useNarrow();
  const { intro, start, sections } = helpFor(tone);
  const scenes = scenesFor(tone).filter((x) => QUICK_SCENES.includes(x.id)).sort((x, y) => QUICK_SCENES.indexOf(x.id) - QUICK_SCENES.indexOf(y.id));
  return (
    <>
      <h2>使い方</h2>
      <p className="hint">{inline(intro)}</p>

      <section className="help-start" aria-label={start.title}>
        <h3>{start.title}</h3>
        <div className="help-steps">
          {start.steps.map((st) => (
            <div key={st.title} className="help-step card">
              <ScreenMock art={st.art} />
              <strong>{st.title}</strong>
              <p>{st.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="困ったとき">
        <h3>困ったとき</h3>
        <div className="help-scenes">
          {scenes.map((sc) => (
            <details key={sc.id} className="card">
              <summary><strong>{sc.title}</strong></summary>
              <ol>{sc.steps.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>
            </details>
          ))}
        </div>
        <p className="hint">ほかの場面は、右上の「ガイド」の「こんなとき」から探せます。</p>
      </section>

      {narrow && (
        <section aria-label="画面の設定" className="card help-theme">
          <h3>画面の色と言い方</h3>
          <p className="hint">配色と、画面・ガイドの言い方(トーン)を選べます。</p>
          <div className="row"><ThemePicker /></div>
        </section>
      )}

      <details className="help-more">
        <summary><strong>くわしい説明を見る({sections.length}項目)</strong></summary>
        <div className="help-cols">
          {sections.map((s) => (
            <Q key={s.id} q={s.q}>
              {s.blocks.map((b, i) => ('p' in b
                ? <p key={i}>{inline(b.p)}</p>
                : 'ul' in b
                  ? <ul key={i}>{b.ul.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>
                  : <ol key={i}>{b.ol.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>))}
            </Q>
          ))}
        </div>
      </details>
    </>
  );
}

function TeacherHelp() {
  return (
    <>
      <h2>使い方(教員)</h2>
      <p className="hint">運用開始の手順は、リポジトリの docs/launch-checklist.md にもあります。</p>
      <div className="help-cols">
      <Q q="毎週の流れ">
        <ol>
          <li>授業日の16:30ごろ(木曜は10:45ごろ)に、リマインドが自動で届きます(Apps Script)。</li>
          <li>「チーム」で、提出状況と「要確認」(2回連続未提出、担当なしの期限超過)を見ます。</li>
          <li>木曜2限は「ミーティング」から、チームを順に開いて10分ずつ。画面の上の4つの段階(前回の約束2分 → 事実の確認3分 → 詰まり・手待ちの解消3分 → 決める2分)を「次へ」で進めます(docs/meeting-guide.md)。「事実の確認」には、メンバーごとの最終の動き・作業ログ・期限超過・約束が出て、「手待ちの人と、タスクの振り分け」では、担当をワンタップで決められます。共有ディスプレイには学生に見せてよい内容だけが出ます。</li>
          <li>結果は、ミーティング画面で記録します。直すときは、チーム詳細の「ミーティング記録」です。</li>
        </ol>
      </Q>
      <Q q="新しいチームを始める(キックオフ)">
        <p>「チーム」→ 該当チーム →「キックオフ」で、企画名と共有フォルダを入れます。雛形の大項目と、取り込んだ案が作られます(再実行しても増えません)。</p>
      </Q>
      <Q q="関与・貢献の確認">
        <p>チーム詳細の「関与」タブで、メンバーごとの目安(作業ログの提出と連続日数、作業ログで触れたタスク、担当・完了・期限超過、約束の達成、ありがとうの送受信)を見られます。確認したほうがよい点は、名前の下に出ます(学生には出ません)。点数には換算せず、成績の参考資料として、教員が判断します。</p>
        <p>ミーティングの「次の1週間でやること」には、担当者(約束した人)を付けられます。次回の冒頭で、誰の約束が果たされたかが分かります。前回の未完了は、「引き継ぐ」でまとめて持ち越せます。</p>
      </Q>
      <Q q="作業ログ・欠席">
        <p>作業ログは授業日のみ。授業時間外の作業も含めて、前回の作業ログのあとにやったことを、まとめて書く運用です(WBSにない作業には「やった日」を付けられます)。学生は当日中だけ直せます。作業ログの間があいた学生には、本人の画面に、やさしいお知らせが出ます(教員の「要確認」とは別)。欠席は「欠席」から教員だけが入力します。運用開始日と、チーム内の作業ログ閲覧は「設定」で変えられます。</p>
      </Q>
      <Q q="授業日・ミーティング・マイルストーン">
        <p>「カレンダー」で、授業日の追加・削除・時限・備考、ミーティングの有無(どの曜日でも)、CSV一括追加、マイルストーンの追加・編集ができます。リマインドも、この授業日を見て送ります。</p>
      </Q>
      <Q q="バックアップから復元する">
        <p>「設定」→「書き出し・バックアップ」→「バックアップから復元する」で、JSONファイルを選びます。範囲(すべて/チームごと)を選んで「内容を確認する」を押すと、何件が上書き・新規になるかが出ます。復元の直前の状態は、自動でダウンロードされるので、取り消しもできます。バックアップにない文書(バックアップのあとに増えたもの)は消えません。</p>
      </Q>
      <Q q="ミーティングの要旨(録音から)">
        <p>録音ファイル(m4a・mp3 など、15MB まで)を、ドライブの「ミーティング録音」フォルダに、<strong>チーム_日付</strong>の名前(例: <code>A_2026-10-28.m4a</code>)で入れると、30分おきに、AI が要旨の<strong>下書き</strong>を作ります(設定は apps-script/README.md)。できると、メールが届きます。</p>
        <p>チーム詳細の「ミーティング記録」に、下書きが出ます(タブに「下書き」の件数)。<strong>AI の聞き間違い、学生を傷つける言い方、個人的な話</strong>がないか確認して直し、「学生に公開」を押すと、学生のホームの「前回のミーティングの要旨」に出ます。公開するまで、学生には見えません。「AIが聞き取れなかった点」は、あなただけに見えます。公開をやめると、下書きに戻ります。録音は、フォルダの「処理済み」に残ります(消えません)。録音なしで、自分で要旨を書くこともできます。</p>
      </Q>
      <Q q="学生の画面を確認する">
        <p>「学生の画面」で、チームと学生を選ぶと、その学生と同じ画面を閲覧のみで見られます。指導の参考にしてください。</p>
      </Q>
      <Q q="データの書き出し・バックアップ">
        <p>「設定」の「書き出し・バックアップ」で、全データのJSONと、CSV(タスク・作業ログ・ミーティング記録・名簿・予定・教員メモ・アクセス履歴)を保存できます。JSONは、同じページの「バックアップから復元する」で戻せます。バックアップは、Apps Script の `setupBackup` を実行すると、毎日、Googleドライブの「バックアップ」フォルダ(共有は「制限付き」にしてください)に自動で保存されます。</p>
      </Q>
      <Q q="WBS・ガントチャートと変更履歴">
        <p>チーム詳細の「WBS・ガントチャート」では、タスクの一覧の右に、予定の期間の棒が並びます(広い画面)。学生は、ふだんは閲覧モードで、「編集モードにする」を押すと、タスクの追加・担当・期間・状態を直せます(状態は、作業ログの提出でも更新されます)。教員は、常に編集でき、保留も設定できます。</p>
        <p>下の「変更履歴」を開くと、誰が・いつ・何を変えたか(状態・担当・期間・追加・削除など)が、新しい順に最大100件見られます。同じ履歴は、チームの学生にも見えます。追加だけができ、書き換え・削除はできません。</p>
      </Q>
      <Q q="アクセス履歴">
        <p>ナビの「アクセス」で、学生がアプリを開いた記録を見られます(教員だけ)。最終アクセス、直近14日のアクセス(◆は授業日)、アクセスした日数、よく見る画面が学生ごとに並び、名前を押すと日ごとの時刻・開いた回数・画面の表示回数が分かります。チームで絞り込めます。</p>
        <p>記録するのは、日付・初回/最終の時刻・開いた回数・画面の表示回数・画面の種類だけです。入力した内容や操作の詳細は記録しません。学生には、初回の案内で、先生が入力内容や利用状況を確認できることを伝えています。画面の表示は2分ごとにまとめて書くので、時刻に最大2分ほどの差があります。教員のアクセスやプレビューは記録しません。</p>
      </Q>
      <Q q="教員専用のもの">
        <p>教員メモ(チーム詳細の専用タブ)とアクセス履歴は、学生に見えません。コメントは学生にも見えます。ミーティング画面は学生に見せる前提です。</p>
      </Q>
      </div>
    </>
  );
}
