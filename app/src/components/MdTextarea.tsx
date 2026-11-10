import { forwardRef, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react';
import { colorsIn } from '../lib/markdown';
import { codeBlock, continueList, indent, insertTable, linkOf, pasteLink, toggleLines, wrap, type Edit, type LineKind } from '../lib/mdEdit';

/**
 * Markdown で書ける入力欄。ふつうの textarea と同じ属性が使える。
 * 書いている間だけ、上に小さな道具の列が出る (太字・斜体・見出し・箇条書き・チェックリスト・引用・コード・表・リンク)。
 * キーボード: Ctrl/⌘+B 太字、Ctrl/⌘+I 斜体、Ctrl/⌘+K リンク、Enter で箇条書きの続き、Tab / Shift+Tab で字下げ。
 * 選んだ文字に URL を貼り付けると、リンクになる。変更は「元に戻す」(Ctrl+Z) で戻せる。
 */
export const MdTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { toolbar?: boolean }>(
  function MdTextarea({ toolbar = true, onKeyDown, onPaste, className, ...rest }, fwd) {
    const ta = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(fwd, () => ta.current as HTMLTextAreaElement);
    const editable = !rest.disabled && !rest.readOnly;
    const colors = colorsIn(String(rest.value ?? '')); // 色の指定 (#ff8800 など) があれば、入力欄の下に、色見本を出す

    /** 新しい内容を、変更した部分だけ差し替えて入れる (execCommand を使うので、元に戻せる)。使えなければ、値を直接書き換える */
    const apply = (e: Edit) => {
      const el = ta.current;
      if (!el) return;
      const old = el.value;
      if (e.value === old) { el.setSelectionRange(e.start, e.end); return; }
      let p = 0;
      while (p < old.length && p < e.value.length && old[p] === e.value[p]) p++;
      let q = 0;
      while (q < old.length - p && q < e.value.length - p && old[old.length - 1 - q] === e.value[e.value.length - 1 - q]) q++;
      el.focus();
      el.setSelectionRange(p, old.length - q);
      const mid = e.value.slice(p, e.value.length - q);
      const ok = mid === '' ? document.execCommand('delete') : document.execCommand('insertText', false, mid);
      if (!ok || el.value !== e.value) {
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        set?.call(el, e.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.setSelectionRange(e.start, e.end);
    };
    const sel = () => ({ v: ta.current!.value, s: ta.current!.selectionStart, e: ta.current!.selectionEnd });
    const bold = () => { const { v, s, e } = sel(); apply(wrap(v, s, e, '**')); };
    const italic = () => { const { v, s, e } = sel(); apply(wrap(v, s, e, '*')); };
    const lines = (k: LineKind) => () => { const { v, s, e } = sel(); apply(toggleLines(v, s, e, k)); };
    const code = () => { const { v, s, e } = sel(); apply(codeBlock(v, s, e)); };
    const table = () => { const { v, s } = sel(); apply(insertTable(v, s)); };
    const link = () => { const { v, s, e } = sel(); apply(linkOf(v, s, e)); };

    const keys = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(ev);
      if (ev.defaultPrevented || !editable || ev.nativeEvent.isComposing) return; // 日本語の変換中の Enter・Tab は、そのまま
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'b') { ev.preventDefault(); bold(); return; }
      if (mod && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'i') { ev.preventDefault(); italic(); return; }
      if (mod && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'k') { ev.preventDefault(); link(); return; }
      if (ev.key === 'Enter' && !ev.shiftKey && !mod && !ev.altKey) {
        const { v, s, e } = sel();
        const r = continueList(v, s, e);
        if (r) { ev.preventDefault(); apply(r); }
        return;
      }
      if (ev.key === 'Tab' && !mod && !ev.altKey) {
        const { v, s, e } = sel();
        // 箇条書きの行か、複数行を選んでいるときだけ、字下げに使う (ふつうの文章では、Tab で次の欄に移れる)
        const onList = /^\s*([-*+] |\d+[.)] |> )/.test(v.slice(v.lastIndexOf('\n', s - 1) + 1));
        if (onList || v.slice(s, e).includes('\n')) { ev.preventDefault(); apply(indent(v, s, e, ev.shiftKey)); }
      }
    };
    const paste = (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
      onPaste?.(ev);
      if (ev.defaultPrevented || !editable) return;
      const { v, s, e } = sel();
      const r = pasteLink(v, s, e, ev.clipboardData.getData('text'));
      if (r) { ev.preventDefault(); apply(r); }
    };

    // 道具を押しても、入力欄から離れないように (離れると、書き終えたことになる欄がある)
    const btn = (label: string, text: string, fn: () => void, title = label) => (
      <button key={label} type="button" className="md-tool" aria-label={label} title={title} onMouseDown={(e) => e.preventDefault()} onClick={fn}>{text}</button>
    );
    return (
      <div className="md-editor">
        {/* 道具の列は、入力欄の後ろに置く (<label> の中に入れても、ラベルが入力欄に付くように)。見た目は CSS で上に出す */}
        <textarea ref={ta} className={className} onKeyDown={keys} onPaste={paste} {...rest} />
        {colors.length > 0 && (
          <div className="md-colors" aria-label="色見本">
            {colors.map((c) => <span key={c} className="color-chip"><i className="swatch" style={{ background: c }} aria-hidden="true" /><code>{c}</code></span>)}
          </div>
        )}
        {toolbar && editable && (
          <div className="md-toolbar" role="toolbar" aria-label="書式">
            {btn('太字', 'B', bold, '太字 (Ctrl+B)')}
            {btn('斜体', 'I', italic, '斜体 (Ctrl+I)')}
            {btn('見出し', 'H', lines('h'))}
            {btn('箇条書き', '・', lines('ul'))}
            {btn('番号つき', '1.', lines('ol'), '番号つきの箇条書き')}
            {btn('チェックリスト', '☑', lines('check'))}
            {btn('引用', '❝', lines('quote'))}
            {btn('コード', '</>', code, 'コードのかたまり')}
            {btn('表', '▦', table, '表を入れる')}
            {btn('リンク', '🔗', link, 'リンク (Ctrl+K)')}
          </div>
        )}
      </div>
    );
  },
);
