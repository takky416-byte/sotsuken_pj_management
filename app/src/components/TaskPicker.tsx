import { useId, useMemo, useState } from 'react';

export type PickOption = { id: string; label: string };

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/** 候補を、入力した文字で絞り込む (部分一致。全角・半角・大文字小文字は区別しない。空白で区切ると、すべてを含むもの) */
export function filterOptions(options: PickOption[], query: string): PickOption[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return words.length === 0 ? options : options.filter((o) => words.every((w) => norm(o.label).includes(w)));
}

/** 文字で絞り込める、タスクの選択。選ぶと onPick を呼び、入力を空に戻す。 */
export function TaskPicker({ options, onPick, label, placeholder }: { options: PickOption[]; onPick: (id: string) => void; label: string; placeholder: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const list = useMemo(() => filterOptions(options, q), [options, q]);
  const pick = (o: PickOption | undefined) => { if (!o) return; onPick(o.id); setQ(''); setOpen(false); setHi(0); };
  return (
    <div className="picker">
      <input
        type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        placeholder={placeholder} value={q}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(list.length - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (open) pick(list[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label}の候補`}>
          {list.length === 0 && <li className="none">該当するタスクがありません</li>}
          {list.map((o, i) => (
            // クリックで入力欄が外れて閉じる前に選べるよう、mouseDown で選ぶ
            <li key={o.id} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(i)}>{o.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
