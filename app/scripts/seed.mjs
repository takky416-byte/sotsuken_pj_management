// 初期データの投入。GitHub Actions (seed ワークフロー) から実行する。
//  - 教員の名簿 (roster/{email}) を作る。最初の教員は、ルールの外から作る必要があるため。
//  - チーム A〜H を作る (既にあれば上書きしない)。
//  - config/settings、授業日 (config/classDays)、共通マイルストーンを作る (既にあれば上書きしない)。
// 個人情報 (学生の名前・メールアドレス) は入れない。学生の名簿は、アプリの教員画面から登録する。
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const email = (process.env.TEACHER_EMAIL ?? '').trim().toLowerCase();
const name = (process.env.TEACHER_NAME ?? '').trim();
if (!email.endsWith('@trident.ac.jp') || !name) {
  console.error('TEACHER_EMAIL (@trident.ac.jp) と TEACHER_NAME が必要です');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: 'sotsuken-pj' });
const db = getFirestore();

await db.doc(`roster/${email}`).set({ name, role: 'teacher', teamId: null, sid: null }, { merge: true });
console.log(`教員を登録しました: ${name}`);

for (const id of 'ABCDEFGH') {
  const ref = db.doc(`teams/${id}`);
  if ((await ref.get()).exists) {
    console.log(`チーム ${id}: 既にあるのでスキップ`);
    continue;
  }
  await ref.set({
    members: [], status: 'planning', projectName: '', proposals: [], driveUrl: '',
    kickoffAt: null, teamMeetingInput: false,
  });
  console.log(`チーム ${id}: 作成`);
}

const settings = db.doc('config/settings');
if (!(await settings.get()).exists) {
  await settings.set({ peerDailyView: true, rotateOrder: true });
  console.log('config/settings: 作成');
}

const calendar = JSON.parse(readFileSync(new URL('../data/calendar.json', import.meta.url), 'utf8'));

const classDays = db.doc('config/classDays');
if (!(await classDays.get()).exists) {
  await classDays.set({ days: calendar.classDays });
  console.log(`config/classDays: ${calendar.classDays.length}日分を作成`);
}

for (const m of calendar.milestones) {
  const { id, ...data } = m;
  const ref = db.doc(`milestones/${id}`);
  if (!(await ref.get()).exists) {
    await ref.set(data);
    console.log(`マイルストーン: ${data.date} ${data.title}`);
  }
}
