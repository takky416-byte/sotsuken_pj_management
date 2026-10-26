import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Apps Script 用の報告書ロジック (apps-script/report-core.js)', () => {
  it('アプリのソースから作り直した内容と一致している (古いままではない)。違うときは `npm run build:gas`', async () => {
    const out = await build({
      entryPoints: ['src/lib/gasReportCore.ts'], bundle: true, format: 'iife', globalName: 'ReportCore', target: 'es2019', write: false,
      banner: { js: '// 自動生成: app/src/lib/gasReportCore.ts から `npm run build:gas` で作る。直接は編集しない。' }, outfile: 'out.js',
    });
    expect(readFileSync('../apps-script/report-core.js', 'utf8')).toBe(out.outputFiles[0].text);
  });
});
