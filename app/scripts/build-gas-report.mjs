// 報告書の中身を作る関数を、Apps Script 用の1ファイル (apps-script/report-core.js) にまとめる: npm run build:gas
import { build } from 'esbuild';

await build({
  entryPoints: ['src/lib/gasReportCore.ts'],
  outfile: '../apps-script/report-core.js',
  bundle: true,
  format: 'iife',
  globalName: 'ReportCore',
  target: 'es2019',
  banner: { js: '// 自動生成: app/src/lib/gasReportCore.ts から `npm run build:gas` で作る。直接は編集しない。' },
  logLevel: 'info',
});
