// 叩き台のアウトラインを点検する: npm run check-draft -- ../docs/wbs-drafts/X.md [--hard] [--fill]
import { readFileSync, writeFileSync } from 'node:fs';
import { checkDraft } from '../src/lib/draftCheck';
import { fillPeriods } from '../src/lib/draftSchedule';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const kind = args.includes('--hard') ? 'ハード' : 'ソフト';
if (files.length === 0) {
  console.error('使い方: npm run check-draft -- <アウトライン.md ...> [--hard] [--fill] [--fill]  (--fill: 期間のない項目に、期間を入れて保存する)');
  process.exit(2);
}
let bad = false;
for (const f of files) {
  let text = readFileSync(f, 'utf8');
  if (args.includes('--fill')) { text = fillPeriods(text); writeFileSync(f, text); }
  const r = checkDraft(text, kind);
  const errs = r.issues.filter((i) => i.level === 'error');
  console.log(`\n${f}: ${r.total}項目 (${r.counts.map((c) => `${c.title}${c.n}`).join(' / ')})`);
  for (const i of r.issues) console.log(`  ${i.level === 'error' ? '✗' : '△'} ${i.message}`);
  if (r.issues.length === 0) console.log('  問題なし');
  if (errs.length) bad = true;
}
process.exit(bad ? 1 : 0);
