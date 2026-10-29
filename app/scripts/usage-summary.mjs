// 利用量の集計 (読み取り専用)。読み取りの無料枠の使われ方を見積もるための数だけを出す。
//  - アクセス履歴: 日ごとに、アクセスした学生数・開いた回数・画面の表示回数
//  - タスクの変更履歴: 日ごと・チームごとの件数 (書き込み1件が、チームの人数ぶんの読み取りになる)
// 個人の名前や内容は出さない。
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const jst = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function usageSummary({ db, log = console.log }) {
  const days = new Map();
  const day = (d) => { if (!days.has(d)) days.set(d, { students: 0, visits: 0, views: 0, taskLogs: 0, writesByTeam: {} }); return days.get(d); };
  for (const d of (await db.collection('accessLogs').get()).docs) {
    const x = d.data();
    const r = day(x.date);
    r.students++; r.visits += x.visits ?? 0; r.views += x.views ?? 0;
  }
  const teams = await db.collection('teams').get();
  const sizes = {};
  for (const t of teams.docs) {
    sizes[t.id] = (t.data().members ?? []).length;
    for (const l of (await t.ref.collection('taskLogs').get()).docs) {
      const r = day(jst(l.data().at ?? 0));
      r.taskLogs++;
      r.writesByTeam[t.id] = (r.writesByTeam[t.id] ?? 0) + 1;
    }
  }
  const rows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  log('日付, アクセスした学生, 開いた回数, 1人あたり開いた回数, 画面表示, タスクの変更(履歴), 変更が届く読み取りの見積もり');
  for (const [date, r] of rows) {
    // 変更1件は、チームの人数 (本人は除く) と、開いている教員の画面に届く
    const push = Object.entries(r.writesByTeam).reduce((n, [team, w]) => n + w * Math.max(0, (sizes[team] ?? 1) - 1), 0);
    log(`${date}, ${r.students}, ${r.visits}, ${r.students ? (r.visits / r.students).toFixed(1) : '-'}, ${r.views}, ${r.taskLogs}, ${push}`);
  }
  // タスクの件数: 画面が毎回読むのは、削除済みも含めた全件
  let live = 0, trash = 0;
  const perTeam = {};
  for (const t of teams.docs) {
    const ts = await t.ref.collection('tasks').get();
    const dead = ts.docs.filter((d) => d.data().deleted === true).length;
    live += ts.size - dead; trash += dead;
    perTeam[t.id] = `${ts.size - dead}+${dead}`;
  }
  log(`チーム人数: ${JSON.stringify(sizes)}`);
  log(`タスク(生きている+削除済み): 合計 ${live}+${trash} / チームごと ${JSON.stringify(perTeam)}`);
  return rows.length;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  initializeApp({ credential: applicationDefault(), projectId: 'sotsuken-pj' });
  await usageSummary({ db: getFirestore() });
}
