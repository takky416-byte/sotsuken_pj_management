// 進捗確認会議の進め方 (1チーム10分)。画面の進行と、使い方・ドキュメントで共通に使う。
export type MeetingStep = {
  id: 'promises' | 'facts' | 'unblock' | 'decide';
  title: string;
  minutes: number;
  /** この段階のねらい */
  goal: string;
  /** 司会が投げかける問い */
  asks: string[];
};

export const MEETING_STEPS: MeetingStep[] = [
  {
    id: 'promises', title: '前回の約束', minutes: 2,
    goal: '前回「やる」と決めたことが、果たされたかを確認する。',
    asks: ['約束は果たせましたか?(果たした印を付ける)', '果たせなかったものは、何が原因でしたか?(事実で答える)'],
  },
  {
    id: 'facts', title: '事実の確認', minutes: 3,
    goal: '記録されたデータで、今週の動きを確認する。気分や印象ではなく、事実から話す。',
    asks: ['予定に対して、実績はどうですか?(進捗・期限超過)', '各メンバーの動き(最後に動いた日・作業レポート・更新)に、気づくことはありますか?', '期限を過ぎたタスクは、いつ終わりますか?'],
  },
  {
    id: 'unblock', title: '詰まり・手待ちの解消', minutes: 3,
    goal: '詰まっていることをチームで解決し、手が空いている人にタスクを振り分ける。',
    asks: ['詰まっていることは、誰がどう手伝いますか?', '手が空いている人はいませんか?(いれば、振り分け案から担当を決める)', '担当がいないタスクは、誰がやりますか?'],
  },
  {
    id: 'decide', title: '決める', minutes: 2,
    goal: '次の1週間でやることを、担当つきで決めて記録する。',
    asks: ['次回までに、誰が何をやりますか?(担当つきで記録)', 'WBSと期間は、実態に合っていますか?(今日直す)'],
  },
];

export const TOTAL_MINUTES = MEETING_STEPS.reduce((a, s) => a + s.minutes, 0);

/** 経過秒に対する、進行中の段階の番号と、その段階の残り秒 (超過すると負)。全体を過ぎたら最後の段階のまま。 */
export function stepAtElapsed(elapsedSec: number): { index: number; remainingSec: number } {
  let end = 0;
  for (let i = 0; i < MEETING_STEPS.length; i++) {
    end += MEETING_STEPS[i].minutes * 60;
    if (elapsedSec < end || i === MEETING_STEPS.length - 1) return { index: i, remainingSec: end - elapsedSec };
  }
  return { index: 0, remainingSec: 0 };
}

export const mmss = (sec: number): string => {
  const s = Math.abs(Math.round(sec));
  return `${sec < 0 ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
