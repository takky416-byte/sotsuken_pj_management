import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

// Apps Script の判定ロジック (apps-script/core.js) のテスト
const Reminder = createRequire(import.meta.url)('../../../apps-script/core.js');

const student = (email: string, name: string, teamId: string, sid: string) => ({ id: email, name, role: 'student', teamId, sid });
const base = () => ({
  today: '2026-10-28', slot: 'afternoon', dailyStartDate: '2026-10-28',
  classDays: [{ date: '2026-10-28', periods: '3-4' }, { date: '2026-10-29', periods: '1-2' }],
  teams: [{ id: 'A', status: 'active' }, { id: 'B', status: 'planning' }],
  students: [student('a1@x', '岩田', 'A', 'A1'), student('a2@x', '近内', 'A', 'A2'), student('a3@x', '森', 'A', 'A3'), student('a4@x', '竹中', 'A', 'A4'), student('b1@x', '長田', 'B', 'B1')],
  dailiesByTeam: {
    A: [
      { sid: 'A1', date: '2026-10-28', entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false },
      { sid: 'A3', date: '2026-10-28', entries: [], blocker: '', absent: true },
      { sid: 'A4', date: '2026-10-28', entries: [{ kind: 'task', taskId: 't', note: '  ' }], blocker: '', absent: false }, // 一言なし = 未提出
    ],
  },
});

describe('decode', () => {
  test('Firestore REST の値', () => {
    const doc = Reminder.decodeDoc({
      name: 'projects/p/databases/(default)/documents/roster/a1@trident.ac.jp',
      fields: {
        name: { stringValue: '岩田' }, n: { integerValue: '5' }, ok: { booleanValue: true }, none: { nullValue: null },
        days: { arrayValue: { values: [{ mapValue: { fields: { date: { stringValue: '2026-10-28' } } } }] } },
      },
    });
    expect(doc).toEqual({ id: 'a1@trident.ac.jp', name: '岩田', n: 5, ok: true, none: null, days: [{ date: '2026-10-28' }] });
    expect(Reminder.decodeDoc({ name: 'x/y' })).toEqual({ id: 'y' });
  });
  test('日付・時間帯', () => {
    expect(Reminder.jstDate(Date.parse('2026-10-27T15:30:00Z'))).toBe('2026-10-28');
    expect(Reminder.slotMatches('3-4', 'afternoon')).toBe(true);
    expect(Reminder.slotMatches('1-2', 'afternoon')).toBe(false);
    expect(Reminder.slotMatches('1-2', 'morning')).toBe(true);
  });
});

describe('plan', () => {
  test('未提出・一言なしの学生だけが対象。提出済み・欠席・キックオフ前のチームは除く', () => {
    const p = Reminder.plan(base());
    expect(p.skip).toBeNull();
    expect(p.recipients.map((r: { name: string }) => r.name)).toEqual(['近内', '竹中']); // A2 (記録なし)、A4 (一言なし)
    expect(p.tooMany).toBe(false);
  });
  test('困っていることだけでも、提出済み', () => {
    const i = base();
    i.dailiesByTeam.A.push({ sid: 'A2', date: '2026-10-28', entries: [], blocker: '相談したい', absent: false });
    expect(Reminder.plan(i).recipients.map((r: { name: string }) => r.name)).toEqual(['竹中']);
  });
  test('今日の日報だけを見る (昨日の分は数えない)', () => {
    const i = base();
    i.dailiesByTeam.A = [{ sid: 'A2', date: '2026-10-27', entries: [{ kind: 'study', note: 'x' }], blocker: '', absent: false }];
    expect(Reminder.plan(i).recipients.map((r: { name: string }) => r.name)).toEqual(['岩田', '近内', '森', '竹中']);
  });
  test('送らない場合: 運用開始前・授業日でない・時間帯が違う', () => {
    expect(Reminder.plan({ ...base(), dailyStartDate: '2026-10-29' }).skip).toContain('運用開始日');
    expect(Reminder.plan({ ...base(), today: '2026-10-30' }).skip).toContain('授業日ではありません');
    expect(Reminder.plan({ ...base(), slot: 'morning' }).skip).toContain('この時間帯の対象ではありません');
    expect(Reminder.plan({ ...base(), today: '2026-10-29', slot: 'morning' }).skip).toBeNull(); // 木曜の午前
  });
  test('上限を超えたら、止める', () => {
    const i = base();
    i.students = Array.from({ length: 41 }, (_, k) => student(`s${k}@x`, `学生${k}`, 'A', `A${k + 1}`));
    i.dailiesByTeam.A = [];
    const p = Reminder.plan(i);
    expect(p.recipients).toHaveLength(41);
    expect(p.tooMany).toBe(true);
  });
  test('メールの文面', () => {
    const m = Reminder.studentMail('岩田', '2026-10-28');
    expect(m.subject).toBe('【卒研】今日の日報をお願いします (10/28)');
    expect(m.body).toContain('岩田 さん');
    expect(m.body).toContain('https://sotsuken-pj.web.app/daily');
    const t = Reminder.teacherTestMail(Reminder.plan(base()));
    expect(t.subject).toContain('[試験]');
    expect(t.body).toContain('学生には、メールを送っていません');
    expect(t.body).toContain('近内');
  });
});
