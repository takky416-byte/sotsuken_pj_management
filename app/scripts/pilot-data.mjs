// 試運転用のデータづくり。指定したチーム (既定 D) を、キックオフ済みで、プロジェクトが4週間ほど進んだ状態にする。
// GitHub Actions (pilot-data ワークフロー) から実行する。dry_run が true (初期値) のときは、件数を表示するだけ。
//
//  - 過去4週間の授業日 (火・水 3-4限、木 1-2限) を、授業日に「ダミー(試運転)」の備考つきで足し、作業レポートの運用開始日を、その初日にする
//    (reset-pilot の「カレンダーも元に戻す」で、元に戻る)
//  - タスク (進行中・完了・期限超過・担当なし・保留)、作業レポート、ミーティング記録 (木曜4回)、先生のコメント、ありがとう
//  - メンバーの苗字は、チームのメンバー表から読む。内容は架空 (名前以外の個人情報は含まない)
//  - 同じ ID のものは上書きする。何度実行しても増えない。タスクは、同じ親の同じ題名がすでにあれば、作らない
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const DUMMY_NOTE = 'ダミー(試運転)';
export const DEFAULT_DAILY_START = '2026-10-28';
const DAY = 86400000;
const JST = 9 * 3600 * 1000;

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=日
const dayKey = (date) => Number(date.replaceAll('-', ''));
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+09:00`);
export const jstToday = (now = Date.now()) => new Date(now + JST).toISOString().slice(0, 10);

/** 過去3週間と今週の授業日 (今日より前)。火・水は 3-4限、木は 1-2限 (ミーティングあり)。 */
export function pastClassDays(today) {
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const out = [];
  for (let w = -3; w <= 0; w++) {
    for (const [offset, periods, meeting] of [[1, '3-4', false], [2, '3-4', false], [3, '1-2', true]]) {
      const date = addDays(monday, w * 7 + offset);
      if (date < today) out.push({ date, periods, meeting, note: DUMMY_NOTE });
    }
  }
  return out;
}

// ---- タスク ----
// S(n): 初日から n 日後、T(n): 今日から n 日後。p: 担当 (メンバーの番号。0=主力、1=ふつう、2=消極的)
function taskPlan(S, T) {
  return [
    { big: '企画の具体化', items: [
      { t: '目的と想定ユーザーを決める', st: 'done', p: [0, 1], s: S(0), e: S(6), d: '誰のどんな困りごとを解決するかを、1文で言えるようにする。' },
      { t: '類似サービスを調べる', st: 'done', p: [1], s: S(2), e: S(9) },
      { t: '主な機能を洗い出す', st: 'done', p: [0], s: S(5), e: S(12) },
      { t: '使う技術を選ぶ', st: 'done', p: [0, 2], s: S(7), e: S(13) },
    ] },
    { big: '要件定義', items: [
      { t: 'ヒアリング項目を作る', st: 'done', p: [1], s: S(9), e: S(14) },
      { t: '利用者にヒアリングする', st: 'done', p: [0, 1], s: S(12), e: S(19), d: '3人以上に聞く。聞いた内容は、作業レポートかチームの共有フォルダに残す。' },
      { t: '機能一覧を作る', st: 'done', p: [0], s: S(14), e: S(21), kids: [
        { t: '必須の機能と、余裕があればやる機能に分ける', st: 'done', p: [1], s: S(18), e: S(21) },
      ] },
      { t: '非機能要件(性能・安全・費用)を決める', st: 'doing', p: [2], s: S(18), e: S(21), d: '表示にかかる時間、扱う個人情報、かかる費用の上限を決める。' },
    ] },
    { big: '外部設計', items: [
      { t: '画面の一覧を考える', st: 'done', p: [1], s: S(20), e: S(24) },
      { t: '画面遷移図を作る', st: 'doing', p: [0], s: S(22), e: T(2), kids: [
        { t: 'ログイン〜トップ画面', st: 'done', p: [0], s: S(22), e: S(24) },
        { t: '投稿・編集の画面', st: 'doing', p: [0], s: S(24), e: T(1) },
        { t: '管理者の画面', st: 'todo', p: [1], s: T(1), e: T(3) },
      ] },
      { t: 'ワイヤーフレームを作る', st: 'doing', p: [1, 0], s: S(22), e: T(4) },
      { t: '外部設計レビューの資料をまとめる', st: 'todo', p: [1], s: T(5), e: T(12) },
    ] },
    { big: '内部設計・実装', items: [
      { t: '開発環境をそろえる', st: 'done', p: [2], s: S(18), e: S(20) },
      { t: 'データベースを設計する(ER図)', st: 'doing', p: [0], s: S(21), e: T(5) },
      { t: 'ログイン機能を実装する', st: 'todo', p: [1], s: T(7), e: T(21) },
      { t: '一覧・検索の機能を実装する', st: 'todo', p: [], s: T(10), e: T(30) },
      { t: 'API の仕様を決める', st: 'hold', p: [0], s: T(5), e: T(14) },
      { t: '通知の機能(余裕があれば)', st: 'hold', p: [], s: null, e: null },
    ] },
    { big: 'テスト・検証', items: [
      { t: 'テスト計画を書く', st: 'todo', p: [], s: S(19), e: S(22), d: '何を、誰が、いつ確かめるかを表にする。' },
      { t: '使い勝手のテストを準備する', st: 'todo', p: [1], s: T(21), e: T(30) },
    ] },
    { big: '発表・展示準備', items: [
      { t: '中間発表のスライドを作る', st: 'todo', p: [0, 1], s: T(14), e: T(28) },
      { t: '展示ポスターの構成を考える', st: 'todo', p: [], s: null, e: null },
    ] },
  ];
}

// 作業レポートの一言。タスクの題名に関わらず使える言い回しを、人ごとの「積極さ」に合わせて選ぶ。
const NOTES = {
  0: ['調べた内容を整理して、チームに共有した', '資料を作り進めた。あと少しで形になる', '前回の指摘を直して、見せられる形にした', '手順を確認しながら進めた。思ったより早く終わった', '分からない点を洗い出して、メンバーに相談した'],
  1: ['担当の部分を進めて、内容を確認した', '先週の続きをやった。半分くらい終わった', '資料を読んで、自分の担当の範囲を確認した', 'チームで話した内容を、メモにまとめた'],
  2: ['少し進めた', '調べた', '確認した', 'やってみた'],
};
const BLOCKERS = {
  1: { 4: 'ヒアリングの相手が見つからない。チームの人に紹介を頼んでみる', 8: 'ワイヤーフレームのツールの使い方が分からない。チームの人に聞いてみる' },
  2: { 5: '何から手を付ければよいか分からず、止まっている', 9: '技術の比較で迷っている。チームで決めたい' },
};

/** 人 (番号) ごとの、提出する授業日の番号。主力は全部、ふつうは2日休み、消極的は途切れがちで直近は2回連続未提出。 */
function submitPlan(persona, n) {
  if (persona === 0) return { submit: new Set([...Array(n).keys()]), absent: new Set() };
  if (persona === 1) return { submit: new Set([...Array(n).keys()].filter((i) => i !== 4 && i !== n - 2)), absent: new Set() };
  const base = [0, 1, 3, 6, 7].filter((i) => i < n - 2);
  return { submit: new Set(base), absent: new Set([5].filter((i) => i < n - 2)) };
}

/**
 * 生成するデータ。Firestore には触れない純粋な関数 (テストしやすいように)。
 * personas: メンバーごとの型 (0=主力、1=ふつう、2=消極的)。省略すると、1人目が主力、2人目がふつう、3人目以降が消極的。
 * @param {{ teamId: string, members: {sid:string,name:string}[], today: string, personas?: number[] | null, existingTasks?: {id:string,title:string,parentId:string|null,depth:number,order:number,deleted?:boolean}[], existingClassDays?: {date:string}[], projectName?: string }} input
 */
export function buildPilot({ teamId, members, today, existingTasks = [], existingClassDays = [], projectName = '', personas = null }) {
  if (members.length === 0) throw new Error(`チーム ${teamId} にメンバーがいません。先に名簿を登録してください`);
  const days = pastClassDays(today);
  const start = days[0].date;
  const S = (n) => addDays(start, n);
  const T = (n) => addDays(today, n);
  const person = (p) => members[p % members.length].sid;
  const persona = (i) => personas?.[i] ?? Math.min(i, 2);
  const live = existingTasks.filter((t) => !t.deleted);

  // ---- タスク ----
  const tasks = [];
  const idOf = new Map(); // 題名 → タスクID (作業レポートで使う)
  const lastOrder = new Map();
  const nextOrder = (parentId) => {
    const base = lastOrder.get(parentId) ?? Math.max(0, ...live.filter((t) => t.parentId === parentId).map((t) => t.order));
    lastOrder.set(parentId, base + 1024);
    return base + 1024;
  };
  const createdBy = (p) => person(p[0] ?? 0);
  const mk = (id, parent, depth, spec) => {
    const owners = spec.p.map(person);
    const done = spec.st === 'done';
    const updated = at(done ? (spec.e ?? start) : (spec.st === 'doing' ? addDays(today, -1) : (spec.s && spec.s < today ? spec.s : start)), '16:00');
    tasks.push({
      id,
      data: {
        title: spec.t, detail: spec.d ?? '', parentId: parent, depth, order: nextOrder(parent), status: spec.st,
        assignees: owners, startDate: spec.s ?? null, endDate: spec.e ?? null, links: [], source: 'user',
        createdBy: createdBy(spec.p), updatedBy: owners[0] ?? createdBy(spec.p), createdAt: at(start, '10:00'), updatedAt: updated,
        deleted: false, deletedAt: null,
      },
    });
    idOf.set(spec.t, id);
  };
  let seq = 0;
  for (const g of taskPlan(S, T)) {
    let big = live.find((t) => t.depth === 1 && t.title === g.big);
    if (!big) {
      const id = `pilot-big-${++seq}`;
      mk(id, null, 1, { t: g.big, st: 'doing', p: [0], s: null, e: null });
      big = { id };
    }
    for (const it of g.items) {
      const same = live.find((t) => t.parentId === big.id && t.title === it.t);
      const id = same ? same.id : `pilot-t${++seq}`;
      if (same) idOf.set(it.t, id); else mk(id, big.id, 2, it);
      for (const k of it.kids ?? []) {
        const sameKid = live.find((t) => t.parentId === id && t.title === k.t);
        if (sameKid) idOf.set(k.t, sameKid.id); else mk(`pilot-t${++seq}`, id, 3, k);
      }
    }
  }

  // WBSにない作業 (作業レポートで「WBSにない作業をした」と書かれて、あとから追加された想定)。大項目「WBS外の作業」の下に、後追いの印つきで
  if (!live.some((t) => t.id === 'adhoc-root')) {
    mk('adhoc-root', null, 1, { t: 'WBS外の作業(あとから追加)', st: 'doing', p: [0] });
    tasks.at(-1).data.source = 'adhoc';
    tasks.at(-1).data.detail = '作業レポートで「WBSにない作業をした」と書かれた作業が、ここに入ります。担当やチームで整理して、WBSの正しい場所に移してください。';
  }
  mk('pilot-adhoc1', 'adhoc-root', 2, { t: '取引先への確認メールを書いて送る', st: 'done', p: [0], s: T(-3), e: T(-3) });
  mk('pilot-adhoc2', 'adhoc-root', 2, { t: 'ヒアリング会場の下見', st: 'done', p: [1], s: T(-5), e: T(-5) });
  for (const id of ['pilot-adhoc1', 'pilot-adhoc2']) tasks.find((t) => t.id === id).data.source = 'adhoc';

  // 親タスク (子のあるタスク) は、担当を付けず、状態は子から自動で決まる (画面は子から求めるが、保存する値もそろえておく)
  const kidsOf = new Map();
  for (const t of [...tasks, ...live.map((l) => ({ id: l.id, data: l }))]) {
    const pid = t.data.parentId;
    if (pid) kidsOf.set(pid, [...(kidsOf.get(pid) ?? []), { id: t.id, status: t.data.status }]);
  }
  const rollup = (id) => {
    const kids = kidsOf.get(id);
    if (!kids) return null;
    const own = kids.map((k) => (kidsOf.has(k.id) ? rollup(k.id) : k.status));
    const active = own.filter((s) => s !== 'hold');
    return active.length === 0 ? 'hold' : active.every((s) => s === 'done') ? 'done' : active.every((s) => s === 'todo') ? 'todo' : 'doing';
  };
  for (const t of tasks) {
    if (!kidsOf.has(t.id)) continue;
    t.data.assignees = [];
    t.data.status = rollup(t.id);
  }

  // ---- 作業レポート ----
  const dailies = [];
  const plans = members.map((_, i) => submitPlan(persona(i), days.length));
  const taskByOwner = (sid) => tasks.filter((t) => t.data.assignees.includes(sid) && t.data.status !== 'hold');
  members.forEach((m, mi) => {
    const pe = persona(mi);
    days.forEach((d, di) => {
      const id = `${d.date}_${m.sid}`;
      const ts = at(d.date, d.periods === '1-2' ? '12:30' : '16:20');
      if (plans[mi].absent.has(di)) {
        dailies.push({ id, data: { sid: m.sid, date: d.date, dayKey: dayKey(d.date), entries: [], blocker: '', absent: true, next: '', submittedAt: ts, updatedAt: ts } });
        return;
      }
      if (!plans[mi].submit.has(di)) return;
      const mine = taskByOwner(m.sid).filter((t) => (t.data.startDate ?? start) <= d.date && (t.data.status !== 'done' || (t.data.endDate ?? d.date) >= addDays(d.date, -3)));
      const entries = [];
      const notes = NOTES[pe];
      const hasBlocker = !!BLOCKERS[pe]?.[di];
      const count = pe === 0 ? 2 : 1;
      for (let k = 0; k < Math.min(count, mine.length); k++) {
        const t = mine[(di + k) % mine.length];
        const finished = t.data.status === 'done' && t.data.endDate && t.data.endDate <= d.date && k === 0;
        entries.push({
          kind: 'task', taskId: t.id, note: hasBlocker && k === 0 ? BLOCKERS[pe][di] : notes[(di + k * 2 + mi) % notes.length],
          result: hasBlocker && k === 0 ? 'stuck' : finished ? 'done' : 'progress',
        });
      }
      if (di % 4 === 1) entries.push({ kind: 'discuss', note: pe === 2 ? '話し合いに参加した' : 'チームで、次にやることを相談した' });
      if (di % 5 === 2 && pe !== 2) entries.push({ kind: 'study', note: '必要な技術について、公式の資料を読んだ' });
      if (entries.length === 0) entries.push({ kind: 'study', note: notes[di % notes.length] });
      // 次にやること: 主力は具体的に、ふつうは短く、消極的な人は書かない
      const first = tasks.find((x) => x.id === entries.find((e) => e.taskId)?.taskId);
      const next = pe === 2 || !first ? '' : pe === 0 ? `「${first.data.title}」の続きを進めて、できた分をチームに共有する。` : `「${first.data.title}」を進める。`;
      dailies.push({ id, data: { sid: m.sid, date: d.date, dayKey: dayKey(d.date), entries, blocker: '', next, absent: false, submittedAt: ts, updatedAt: ts } });
    });
  });

  // ---- ミーティング記録 (木曜) ----
  const thursdays = days.filter((d) => d.meeting).slice(-4);
  const A = (text, p, done) => ({ text, owner: p === null ? null : person(p), done });
  const meetingText = [
    { decided: '企画の方向を確認した。まず、想定ユーザーと主な機能を洗い出す。', actions: [A('類似サービスを3つ調べる', 1, true), A('機能の洗い出しの叩き台を作る', 0, true), A('使う技術の候補を出す', 2, false)] },
    { decided: '利用者へのヒアリングを来週までに行う。使う技術は、候補を比べて決める。', actions: [A('ヒアリング項目を作る', 1, true), A('ヒアリングの相手に連絡する', 0, true), A('技術の比較表を作る', 2, false)] },
    { decided: '機能一覧を確定して、外部設計に進む。必須の機能に絞る。', actions: [A('機能一覧を清書する', 0, true), A('画面の一覧を考える', 1, true), A('非機能要件の案を出す', 2, false)] },
    { decided: '画面遷移図とワイヤーフレームを進める。非機能要件は、今週中に出す。', actions: [A('画面遷移図を仕上げる', 0, false), A('ワイヤーフレームを描く', 1, false), A('非機能要件の案を出す', 2, false), A('外部設計の分担を、チームで確認する', null, false)] },
  ].slice(-thursdays.length);
  const meetings = thursdays.map((d, i) => ({
    id: d.date, data: { date: d.date, decided: meetingText[i].decided, actions: meetingText[i].actions, note: '', createdBy: 'teacher', updatedAt: at(d.date, '12:00') },
  }));

  // ---- 先生のコメント ----
  const commentTexts = ['ヒアリングは、具体的な質問を用意してから臨むこと。', '要件は、優先順位を付けて絞ること。全部やろうとしない。', '担当に偏りがあります。次回までに、分担を見直してください。'];
  const comments = thursdays.slice(-3).map((d, i) => ({
    id: `pilot-c${i + 1}`, data: { body: commentTexts[i], target: { type: 'meeting', id: d.date }, createdAt: at(d.date, '12:20') },
  }));

  // ---- ありがとう ----
  const pairs = [[1, 0, 'レビューしてくれて助かった', 4], [0, 1, 'ヒアリングの相手を紹介してくれてありがとう', 6], [2, 0, '環境づくりを手伝ってくれた', 3], [0, 2, '開発環境を整えてくれて助かった', 3], [1, 0, '資料の構成を一緒に考えてくれた', 9], [0, 1, '遅くまで付き合ってくれた', 10],
    ...(members.length > 3 ? [[0, 3, '質問に丁寧に答えてくれてありがとう', 7], [3, 1, '分からないところを教えてくれた', 8]] : [])];
  const thanks = pairs.filter(([a, b]) => members.length > Math.max(a, b) || a % members.length !== b % members.length)
    .map(([a, b, note, di], i) => {
      const date = days[Math.min(di, days.length - 1)].date;
      return { id: `pilot-th${i + 1}`, data: { from: person(a), to: person(b), note, date, createdAt: at(date, '16:40') } };
    }).filter((t) => t.data.from !== t.data.to);

  // ---- アクセス履歴 (主力は毎授業日、ふつうはほぼ毎回、消極的な人は少なく、直近は来ていない) ----
  const accessLogs = [];
  members.forEach((m, mi) => {
    const pe = persona(mi);
    days.forEach((d, di) => {
      const visited = pe === 0 ? true : pe === 1 ? di % 5 !== 4 : di % 3 === 0 && di < days.length - 3;
      if (!visited) return;
      const first = at(d.date, d.periods === '1-2' ? '11:20' : '15:10');
      accessLogs.push({
        id: `${d.date}_${m.sid}`,
        data: {
          sid: m.sid, teamId, date: d.date, firstAt: first, lastAt: first + (pe === 2 ? 6 : 55) * 60000, visits: pe === 2 ? 1 : 2,
          views: pe === 2 ? 5 : pe === 0 ? 42 : 24, screens: pe === 2 ? { home: 3, daily: 2 } : { home: 12, wbs: 10, daily: 6, gantt: 4, meeting: 2 },
        },
      });
    });
  });

  // ---- チーム・カレンダー ----
  const have = new Set(existingClassDays.map((d) => d.date));
  return {
    start, days, tasks, dailies, meetings, comments, thanks, accessLogs,
    team: { status: 'active', kickoffAt: at(start, '10:00'), teamMeetingInput: false, ...(projectName ? {} : { projectName: 'イベント情報共有アプリ(試運転)' }) },
    newClassDays: days.filter((d) => !have.has(d.date)),
  };
}

// ---- 書き込み ----
export async function applyPilot({ db, teamId, dryRun = true, now = Date.now(), personas = null, log = console.log }) {
  const teamRef = db.doc(`teams/${teamId}`);
  const team = await teamRef.get();
  if (!team.exists) throw new Error(`チーム ${teamId} がありません`);
  const t = team.data();
  const tasksSnap = await teamRef.collection('tasks').get();
  const existingTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const classDaysDoc = await db.doc('config/classDays').get();
  const existingDays = classDaysDoc.exists ? classDaysDoc.data().days ?? [] : [];

  const p = buildPilot({ teamId, members: t.members ?? [], today: jstToday(now), existingTasks, existingClassDays: existingDays, projectName: t.projectName, personas });
  log(`チーム ${teamId} (メンバー ${t.members.length}人、状態 ${t.status}、タスク ${existingTasks.length}件、作業レポート ${(await teamRef.collection('dailyReports').count().get()).data().count}件)`);
  log(`作る: タスク ${p.tasks.length} / 作業レポート ${p.dailies.length} / ミーティング記録 ${p.meetings.length} / コメント ${p.comments.length} / ありがとう ${p.thanks.length} / アクセス履歴 ${p.accessLogs.length} / 授業日 ${p.newClassDays.length}日 (${p.start}〜)`);
  if (dryRun) { log('--- ドライラン: 何も書き込んでいません ---'); return p; }

  const writes = [
    ...p.tasks.map((x) => [teamRef.collection('tasks').doc(x.id), x.data]),
    ...p.dailies.map((x) => [teamRef.collection('dailyReports').doc(x.id), x.data]),
    ...p.meetings.map((x) => [teamRef.collection('meetings').doc(x.id), x.data]),
    ...p.comments.map((x) => [teamRef.collection('comments').doc(x.id), x.data]),
    ...p.thanks.map((x) => [teamRef.collection('thanks').doc(x.id), x.data]),
    ...p.accessLogs.map((x) => [db.collection('accessLogs').doc(x.id), x.data]),
  ];
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    for (const [ref, data] of writes.slice(i, i + 400)) b.set(ref, data);
    await b.commit();
  }
  await teamRef.update(p.team);
  if (p.newClassDays.length) {
    const days = [...existingDays, ...p.newClassDays].sort((a, b) => a.date.localeCompare(b.date));
    await db.doc('config/classDays').set({ days });
  }
  const settings = await db.doc('config/settings').get();
  const cur = settings.exists ? settings.data().dailyStartDate : undefined;
  if (!cur || cur > p.start) {
    await db.doc('config/settings').set({ dailyStartDate: p.start }, { merge: true });
    log(`作業レポートの運用開始日を ${cur ?? '(未設定)'} → ${p.start} にしました (reset-pilot の「カレンダーも元に戻す」で ${DEFAULT_DAILY_START} に戻ります)`);
  }
  log('--- 書き込みました ---');
  return p;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const teamId = (process.env.TEAM ?? 'D').trim().toUpperCase();
  if (!/^[A-H]$/.test(teamId)) throw new Error('TEAM は A〜H で指定してください');
  initializeApp({ credential: applicationDefault(), projectId: 'sotsuken-pj' });
  const personas = (process.env.PERSONAS ?? '').trim() ? process.env.PERSONAS.split(',').map((x) => Number(x.trim())) : null;
  if (personas && personas.some((x) => ![0, 1, 2].includes(x))) throw new Error('PERSONAS は 0,1,2 をカンマ区切りで指定してください (0=主力、1=ふつう、2=消極的)');
  await applyPilot({ db: getFirestore(), teamId, dryRun: process.env.DRY_RUN !== 'false', personas });
}
