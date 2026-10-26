// 卒研の成果物 (あらかじめ決まっている「これをつくる」の一覧)。叩き台 (初期WBS) に、必ず項目として入れる。
// 出典: 教員から共有された成果物の一覧 (2026-10-26)。中間報告 = 外部設計レビュー (11/25) とみなしている (要確認)。
export type Stage = '中間報告' | '最終報告' | '卒展';

export type Deliverable = {
  label: string;
  stage: Stage;
  /** 項目を入れる大項目 */
  section: string;
  /** 項目の題名に、これが入っていること */
  re: RegExp;
  /** 項目の終了日の期限 (YYYY-MM-DD) */
  end: string;
  /** 'soft' / 'hard': その種類の企画だけに必要。なければ、どの企画にも必要 */
  only?: 'soft' | 'hard';
  /** 事前送付など */
  note?: string;
};

export const MID = '2026-11-25'; // 中間報告 (対面レビュー)
export const FINAL = '2027-01-26'; // 最終報告 (プレゼン)

export const DELIVERABLES: Deliverable[] = [
  // 中間報告までの成果物 (対面レビュー)。設計書類は事前送付
  { label: '要件定義書', stage: '中間報告', section: '要件定義', re: /要件定義書/, end: '2026-11-20', note: '事前送付' },
  { label: '画面レイアウト', stage: '中間報告', section: '外部設計', re: /画面レイアウト/, end: '2026-11-20', note: '事前送付' },
  { label: '画面遷移図', stage: '中間報告', section: '外部設計', re: /画面遷移図/, end: '2026-11-20', note: '事前送付' },
  { label: '機能仕様書', stage: '中間報告', section: '外部設計', re: /機能仕様書/, end: '2026-11-20', note: '事前送付' },
  { label: 'システム構成図', stage: '中間報告', section: '外部設計', re: /システム構成図/, end: '2026-11-20', note: '事前送付' },
  { label: 'ER図', stage: '中間報告', section: '内部設計・実装', re: /ER図/, end: '2026-11-20', only: 'soft', note: '事前送付' },
  { label: 'テーブル定義書', stage: '中間報告', section: '内部設計・実装', re: /テーブル定義/, end: '2026-11-20', only: 'soft', note: '事前送付' },
  { label: '回路図', stage: '中間報告', section: '内部設計・実装', re: /回路図/, end: '2026-11-20', only: 'hard', note: '事前送付' },
  { label: '設計書類の事前送付', stage: '中間報告', section: '外部設計', re: /事前送付|送付/, end: MID },
  { label: '試作品', stage: '中間報告', section: '内部設計・実装', re: /試作品/, end: MID, note: '中間報告で見せられるもの' },
  // 最終報告までに用意するもの (プレゼン方式)
  { label: '発表スライド', stage: '最終報告', section: '発表・展示準備', re: /発表スライド/, end: FINAL, note: '事前送付' },
  { label: '最新化した設計書類', stage: '最終報告', section: '発表・展示準備', re: /最新化|設計書類/, end: FINAL, note: '事前送付' },
  { label: 'デモの準備(デモ動画)', stage: '最終報告', section: '発表・展示準備', re: /デモ/, end: FINAL, note: '当日デモを見せられない場合は、デモ動画' },
  // 卒展までに用意するもの
  { label: '操作説明書', stage: '卒展', section: '発表・展示準備', re: /操作説明書/, end: '2027-02-06' },
  { label: '卒展のシフト表', stage: '卒展', section: '発表・展示準備', re: /シフト表/, end: '2027-02-06' },
  { label: 'アプリ説明用スライド', stage: '卒展', section: '発表・展示準備', re: /アプリ説明.*スライド|説明用スライド/, end: '2027-02-06' },
  { label: 'アプリ説明動画', stage: '卒展', section: '発表・展示準備', re: /アプリ説明.*動画|説明動画/, end: '2027-01-27' },
  { label: '動画のYouTube限定公開', stage: '卒展', section: '発表・展示準備', re: /YouTube|限定公開/, end: '2027-01-27' },
  { label: '卒展用パネル', stage: '卒展', section: '発表・展示準備', re: /パネル/, end: '2027-02-06' },
];
