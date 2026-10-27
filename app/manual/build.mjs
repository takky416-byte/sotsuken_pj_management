// 操作マニュアル (HTML・PDF) と、デモ動画 (MP4) を作る。画面写真は manual/out/shots、動画は manual/out/videos-raw にある前提。
// 出力: ../docs/manual/
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = '../docs/manual';
mkdirSync(OUT, { recursive: true });
const c = JSON.parse(readFileSync('manual/content.json', 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (f) => `data:image/png;base64,${readFileSync(`manual/out/shots/${f}.png`).toString('base64')}`;

// 動画: webm → mp4
const videos = [];
for (const v of c.videos) {
  const src = `manual/out/videos-raw/${v.file}.webm`;
  if (!existsSync(src)) continue;
  const dst = `${OUT}/${v.file}.mp4`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', dst]);
  videos.push({ ...v, mp4: `${v.file}.mp4` });
}

const css = `
:root { --ac:#0a84ff; --fg:#14223a; --muted:#5a6a85; --line:#d7e2f2; --soft:#e8f2ff; --hot:#ff7a00; }
* { box-sizing:border-box; }
body { font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif; color:var(--fg); margin:0; line-height:1.7; font-size:15px; background:#fff; }
main { max-width:900px; margin:0 auto; padding:24px 20px 60px; }
.cover { text-align:center; padding:70px 0 40px; border-bottom:4px solid var(--ac); margin-bottom:28px; }
.cover h1 { font-size:34px; margin:0 0 6px; } .cover .sub { font-size:20px; color:var(--ac); font-weight:700; }
.cover p { color:var(--muted); max-width:640px; margin:18px auto 0; text-align:left; }
h2 { font-size:22px; border-left:6px solid var(--ac); padding-left:10px; margin:36px 0 8px; break-after:avoid; }
h3 { font-size:17px; margin:20px 0 6px; }
.lead { color:var(--muted); margin:4px 0 10px; }
.steps { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.step { border:1px solid var(--line); border-radius:10px; padding:10px 12px; background:var(--soft); break-inside:avoid; }
.step b { display:block; }
figure { margin:14px 0; break-inside:avoid; }
figure img { width:100%; border:1px solid var(--line); border-radius:8px; display:block; }
figure.tall img { margin:0 auto; }
figure.phone { text-align:center; display:inline-block; width:48%; vertical-align:top; } figure.phone img { width:auto; max-height:150mm; margin:0 auto; }
figcaption { font-weight:700; margin-bottom:4px; color:var(--ac); }
ol.legend { margin:8px 0 0; padding:0; list-style:none; }
ol.legend li { display:flex; gap:8px; margin:4px 0; align-items:flex-start; }
.n { flex:none; width:24px; height:24px; border-radius:50%; background:var(--hot); color:#fff; font-weight:700; display:grid; place-items:center; font-size:13px; margin-top:2px; }
ul.notes { background:var(--soft); border-radius:10px; padding:10px 14px 10px 30px; margin:10px 0; break-inside:avoid; }
.vids { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.vid { border:1px solid var(--line); border-radius:10px; padding:10px; break-inside:avoid; } .vid video { width:100%; border-radius:6px; background:#000; } .vid .file { color:var(--muted); font-size:13px; }
.faq dt { font-weight:700; margin-top:12px; color:var(--ac); } .faq dd { margin:2px 0 0; }
.toc { columns:2; margin:10px 0; } .toc a { color:var(--fg); text-decoration:none; }
@media print { main { padding:0; max-width:none; } .cover { padding:30mm 0 10mm; } .vid video { display:none; } h2 { break-before:page; } .cover + .intro h2, .intro h2:first-child { break-before:auto; } }
@page { size:A4; margin:14mm; }
`;

const legend = (marks) => marks.length ? `<ol class="legend">${marks.map((m, i) => `<li><span class="n">${i + 1}</span><span>${esc(m)}</span></li>`).join('')}</ol>` : '';
const shotHtml = (s, sec) => {
  const phone = s.file.includes('phone');
  return `<figure class="${phone ? 'phone' : sec.id === 'home' || sec.id === 'wbs' ? 'tall' : ''}"><figcaption>${esc(s.cap)}</figcaption><img src="${img(s.file)}" alt="${esc(s.cap)}">${legend(s.marks)}</figure>`;
};

const html = (withVideo) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)} ${esc(c.subtitle)}</title><style>${css}</style></head><body><main>
<section class="cover"><h1>${esc(c.title)}</h1><div class="sub">${esc(c.subtitle)}</div><p>${esc(c.lead)}</p></section>
<section class="intro"><h2>まずはこの4つ</h2><div class="steps">${c.start.map((s) => `<div class="step"><b>${esc(s.t)}</b>${esc(s.d)}</div>`).join('')}</div>
<h3>目次</h3><div class="toc">${c.sections.map((s) => `<div><a href="#${s.id}">${esc(s.title)}</a></div>`).join('')}<div><a href="#videos">10. 操作デモ動画</a></div><div><a href="#faq">11. 困ったとき</a></div></div></section>
${c.sections.map((sec) => `<section id="${sec.id}"><h2>${esc(sec.title)}</h2><p class="lead">${esc(sec.lead)}</p>${sec.shots.map((s) => shotHtml(s, sec)).join('')}${sec.notes ? `<ul class="notes">${sec.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
<section id="videos"><h2>10. 操作デモ動画</h2><p class="lead">${withVideo ? 'このマニュアルと同じフォルダの動画です。字幕つき・音声なしです。' : '同じフォルダの動画ファイル(MP4)です。字幕つき・音声なしです。'}</p><div class="vids">${videos.map((v) => `<div class="vid"><b>${esc(v.t)}</b>${withVideo ? `<video controls preload="none" src="${v.mp4}"></video>` : ''}<div>${esc(v.d)}</div><div class="file">${v.mp4}</div></div>`).join('')}</div></section>
<section id="faq"><h2>11. 困ったとき</h2><dl class="faq">${c.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl></section>
</main></body></html>`;

const base = '卒研PJ管理_操作マニュアル_学生編';
writeFileSync(`${OUT}/${base}.html`, html(true));
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage();
await page.setContent(html(false), { waitUntil: 'load' });
await page.pdf({ path: `${OUT}/${base}.pdf`, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
await browser.close();
console.log('manual built');
