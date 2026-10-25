// 叩き台のアウトラインを点検する: npm run check-draft -- ../docs/wbs-drafts/X.md [--hard]
import { readFileSync } from 'node:fs';
import { checkDraft } from '../src/lib/draftCheck';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const kind = args.includes('--hard') ? 'ハード' : 'ソフト';
if (files.length === 0) {
  console.error('使い方: npm run check-draft -- <アウトライン.md ...> [--hard]');
  process.exit(2);
}
let bad = false;
for (const f of files) {
  const r = checkDraft(readFileSync(f, 'utf8'), kind);
  const errs = r.issues.filter((i) => i.level === 'error');
  console.log(`\n${f}: ${r.total}項目 (${r.counts.map((c) => `${c.title}${c.n}`).join(' / ')})`);
  for (const i of r.issues) console.log(`  ${i.level === 'error' ? '✗' : '△'} ${i.message}`);
  if (r.issues.length === 0) console.log('  問題なし');
  if (errs.length) bad = true;
}
process.exit(bad ? 1 : 0);
