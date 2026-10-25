// 使い方・ガイド用の、画面のイメージ図。実際の画面の写真ではなく、画面の作りを簡単に描いたもの
// (画面が変わっても、写真のように古くならない)。ボタン名・見出しは、実際の画面と同じにすること。
export type ArtId = 'nav' | 'home' | 'daily' | 'wbs' | 'gantt' | 'team' | 'pj';

const MENU = ['ホーム', '作業ログ', 'WBS・ガントチャート', 'PJ分析', '使い方'] as const;

/** 画面のイメージ図の、読み上げ用の説明 */
export const ART_ALT: Record<ArtId, string> = {
  nav: '上のメニュー: ホーム、作業ログ、WBS・ガントチャート、PJ分析',
  home: 'ホームの画面: あいさつの帯に「作業ログを書く」、左に今日やること、右にミッション',
  daily: '作業ログの画面: 結果のボタンを選び、一言を書き、「作業ログを送信」を押す',
  wbs: 'WBS・ガントチャートの画面: タスクの一覧の右に、期間の棒とマイルストーン',
  gantt: 'ガントチャートの画面: 棒をドラッグして期間を変える。赤い線は今日、オレンジの線は稲妻線',
  team: 'ホームの下の、チームのようす: メンバーごとの状況と、ありがとうのスタンプ',
  pj: 'PJ分析の画面: 「ミーティングを始める」ボタンと、概況・分析',
};

const N = ({ n }: { n: number }) => <b className="mk-n">{n}</b>;
const Line = ({ w = 100, dim = false }: { w?: number; dim?: boolean }) => <i className={`mk-line${dim ? ' dim' : ''}`} style={{ width: `${w}%` }} />;
const Nav = ({ on }: { on?: (typeof MENU)[number] }) => (
  <div className="mk-nav">{MENU.map((m) => <span key={m} className={m === on ? 'on' : ''}>{m}</span>)}</div>
);
const Bar = ({ l, w, kind = '' }: { l: number; w: number; kind?: string }) => <i className={`mk-bar ${kind}`} style={{ left: `${l}%`, width: `${w}%` }} />;

function Art({ art }: { art: ArtId }) {
  switch (art) {
    case 'nav':
      return (
        <>
          <Nav />
          <div className="mk-tiles">
            <div><strong>ホーム</strong><span>今日・次にやること</span></div>
            <div><strong>作業ログ</strong><span>授業日に、やったことを書く</span></div>
            <div><strong>WBS・ガントチャート</strong><span>チームの予定を見る・直す</span></div>
            <div><strong>PJ分析</strong><span>状況を見る・ミーティング</span></div>
          </div>
        </>
      );
    case 'home':
      return (
        <>
          <Nav on="ホーム" />
          <div className="mk-hero"><span>こんにちは、〇〇さん</span><span className="mk-btn hot">作業ログを書く <N n={1} /></span></div>
          <div className="mk-cols">
            <div className="mk-card"><strong>今日やること <N n={2} /></strong><Line /><Line w={70} dim /></div>
            <div className="mk-card"><div className="mk-msg">先生からのメッセージ <N n={3} /></div><strong>今日のミッション</strong><Line w={80} /></div>
          </div>
        </>
      );
    case 'daily':
      return (
        <>
          <Nav on="作業ログ" />
          <div className="mk-card">
            <strong>1. やったこと</strong>
            <div className="mk-task"><span>ログイン画面を作る</span>
              <span className="mk-chips"><span className="mk-chip on">進んだ</span><span className="mk-chip">完了した</span><span className="mk-chip">詰まった</span></span><N n={1} />
            </div>
            <div className="mk-input">何を・どこまでやったか、一言 <N n={2} /></div>
            <strong>2. つぎにやること</strong>
            <div className="mk-input">次の授業日までにやること <N n={3} /></div>
          </div>
          <div className="mk-submit"><span className="mk-btn hot">作業ログを送信 <N n={4} /></span></div>
        </>
      );
    case 'wbs':
      return (
        <>
          <Nav on="WBS・ガントチャート" />
          <div className="mk-gantt">
            <div className="mk-ms">◆ マイルストーン <N n={1} /></div>
            <div className="mk-row"><span>設計</span><div className="mk-track"><Bar l={5} w={40} kind="done" /></div></div>
            <div className="mk-row"><span>実装</span><div className="mk-track"><Bar l={30} w={45} kind="doing" /></div></div>
            <div className="mk-row"><span>テスト</span><div className="mk-track"><Bar l={70} w={25} /></div></div>
            <i className="mk-today" />
          </div>
          <div className="mk-note"><N n={2} />ふだんは閲覧モード。「編集モードにする」で直せます</div>
        </>
      );
    case 'gantt':
      return (
        <>
          <Nav on="WBS・ガントチャート" />
          <div className="mk-gantt">
            <div className="mk-row"><span>設計</span><div className="mk-track"><Bar l={5} w={40} kind="done" /></div></div>
            <div className="mk-row"><span>実装</span><div className="mk-track"><Bar l={30} w={45} kind="doing" /><i className="mk-grip" style={{ left: '73%' }} /></div></div>
            <div className="mk-row"><span>テスト</span><div className="mk-track"><Bar l={70} w={25} /></div></div>
            <i className="mk-today" />
            <svg className="mk-bolt" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="40,0 40,16 28,50 40,84 40,100" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
          </div>
          <div className="mk-note"><N n={1} />棒をドラッグで期間を変更 <N n={2} />赤い線は今日、オレンジの線は遅れ・先行</div>
        </>
      );
    case 'team':
      return (
        <>
          <div className="mk-card">
            <strong>チームのようす <N n={1} /></strong>
            <div className="mk-members"><span>〇〇</span><Line w={60} /><span>△△</span><Line w={40} /><span>□□</span><Line w={75} /></div>
            <strong>ありがとう <N n={2} /></strong>
            <span className="mk-chips"><span className="mk-chip">助かりました</span><span className="mk-chip">ありがとう</span><span className="mk-chip">おめでとう</span></span>
          </div>
        </>
      );
    case 'pj':
      return (
        <>
          <Nav on="PJ分析" />
          <div className="mk-hero plain"><strong>PJ分析</strong><span className="mk-btn hot">ミーティングを始める <N n={1} /></span></div>
          <div className="mk-steps"><span>前回の約束</span><span>事実の確認</span><span>詰まり・手待ち</span><span>決める</span></div>
          <div className="mk-note"><N n={2} />概況・分析・WBSは、Excel・PDFで保存できます</div>
        </>
      );
  }
}

export function ScreenMock({ art, className = '' }: { art: ArtId; className?: string }) {
  return (
    <figure className={`mock ${className}`} role="img" aria-label={ART_ALT[art]}>
      <div className="mk-screen" aria-hidden="true"><Art art={art} /></div>
    </figure>
  );
}
