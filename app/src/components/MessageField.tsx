import { useId } from 'react';
import { MESSAGE_MAX } from '../lib/teamMessage';
import { Markdown } from './Markdown';

/** 先生がチームへの連絡事項を書く欄。長文・書式 (太字・下線など) に対応し、学生の画面と同じ見た目のプレビューが出る */
export function MessageField({ value, onChange, label, id }: { value: string; onChange: (v: string) => void; label: string; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="msg-field">
      <textarea id={fid} rows={10} maxLength={MESSAGE_MAX} value={value} aria-label={label}
        placeholder={'例:\n【連絡事項】11月4日(水)\n\n◎ **機材購入申請リスト** (11月5日(木)2限終了〆切)\n・必要な機材がある場合は、リストを作って提出してください。\n\n◎ 進捗確認MTG\n・11月5日(木)の1限に、1チーム10分程度で実施します。'}
        onChange={(e) => onChange(e.target.value)} />
      <div className="row msg-field-meta">
        <span className="hint">{value.length} / {MESSAGE_MAX}字</span>
        <span className="hint">書式: **太字** ・ ++下線++ ・ # 見出し ・ - 箇条書き ・ 空行で段落 ・ URLは自動でリンク</span>
      </div>
      {value.trim() && (
        <details className="msg-preview">
          <summary>学生の画面での見え方(プレビュー)</summary>
          <div className="card teacher-msg"><Markdown text={value} className="msg-text" /></div>
        </details>
      )}
    </div>
  );
}
