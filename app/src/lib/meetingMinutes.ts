// ミーティングの議事録 (先生がテキストをアップして、チームの学生に公開する)。画面にも Firestore にも依存しない処理。

/** teams/{チーム}/meetingMinutes/{日付}。先生だけが書ける。チームの学生は読める。 */
export type MeetingMinutes = {
  id: string; // 日付 (YYYY-MM-DD)
  date: string;
  text: string;
  publishedAt: number;
};

export const MAX_MINUTES_CHARS = 10000;

/**
 * テキストファイルの中身を文字にする。ふつうは UTF-8。Windows のメモ帳などが作る Shift_JIS のファイルも読む。
 * 先頭の BOM と、行末の CR は除く。
 */
export function decodeTextFile(buf: ArrayBuffer): string {
  let s: string;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { s = new TextDecoder('shift_jis').decode(buf); }
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export type MinutesCheck = { ok: true; text: string } | { ok: false; reason: string };

/** 公開できるか。空・長すぎるものは、理由つきで断る。前後の空白と、3行以上の空行は整える。 */
export function checkMinutes(raw: string): MinutesCheck {
  const text = raw.split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { ok: false, reason: '議事録が空です' };
  if (text.length > MAX_MINUTES_CHARS) return { ok: false, reason: `長すぎます (${text.length}字。上限 ${MAX_MINUTES_CHARS}字)。要点にしぼるか、分けてください` };
  return { ok: true, text };
}

/** 学生のホームに出す、いちばん新しい議事録と、それ以前のもの (新しい順)。 */
export function splitLatest<T extends { date: string }>(list: T[]): { latest: T | null; older: T[] } {
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
  return { latest: sorted[0] ?? null, older: sorted.slice(1) };
}
