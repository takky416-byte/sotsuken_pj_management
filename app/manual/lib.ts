import { expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export const OUT = 'manual/out';
export const SHOTS = `${OUT}/shots`;
export const VIDEOS = `${OUT}/videos-raw`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(VIDEOS, { recursive: true });

/** Googleログイン (エミュレータ) 。初回の案内が出たら、onNotice で撮影してから「確認して始める」を押す。 */
export async function loginAs(page: Page, email: string, opts: { onNotice?: () => Promise<void>; keepGuide?: boolean } = {}) {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByRole('button', { name: new RegExp(email.replace(/[.@]/g, '\\$&')) });
  if (await existing.count()) await existing.first().click();
  else {
    await popup.getByRole('button', { name: /Add new account/i }).click();
    await popup.getByLabel(/email/i).fill(email);
    await popup.getByLabel(/display name/i).fill(email.split('@')[0]);
    await popup.getByRole('button', { name: /Sign in with Google/i }).click();
  }
  await popup.waitForEvent('close').catch(() => undefined);
  const start = page.getByRole('button', { name: '確認して始める' });
  const header = page.getByRole('button', { name: 'ログアウト' });
  await expect(start.or(header).first()).toBeVisible();
  if (await start.isVisible()) {
    await opts.onNotice?.();
    await start.click();
    if (opts.keepGuide) return;
    const close = page.getByRole('button', { name: 'ガイドを閉じる' });
    await close.waitFor({ timeout: 3000 }).then(() => close.click()).catch(() => undefined);
  }
}

/** 注目する場所に、枠と番号を重ねる (撮影用。画面の操作は妨げない)。ページ上の位置 (スクロールに関係なく) に置く。 */
export async function mark(page: Page, items: { loc: Locator; n: number; pad?: number }[]) {
  for (const { loc, n, pad = 4 } of items) {
    const box = await loc.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    });
    if (!box.width || !box.height) continue;
    await page.evaluate(({ box, n, pad }) => {
      const frame = document.createElement('div');
      frame.className = 'manual-mark';
      Object.assign(frame.style, {
        position: 'absolute', left: `${box.x - pad}px`, top: `${box.y - pad}px`, width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`,
        border: '3px solid #ff7a00', borderRadius: '8px', pointerEvents: 'none', zIndex: '99998', boxShadow: '0 0 0 2px rgba(255,255,255,.8)',
      });
      const badge = document.createElement('div');
      badge.textContent = String(n);
      Object.assign(badge.style, {
        position: 'absolute', left: '-12px', top: '-14px', width: '26px', height: '26px', borderRadius: '50%', background: '#ff7a00', color: '#fff',
        font: '700 15px sans-serif', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.4)',
      });
      frame.appendChild(badge);
      document.body.appendChild(frame);
    }, { box, n, pad });
  }
}
export const clearMarks = (page: Page) => page.evaluate(() => document.querySelectorAll('.manual-mark').forEach((e) => e.remove()));

/** 撮影。marks があれば、枠と番号を付ける。縦に長い画面は、上から maxH (px) までにする (印刷で1ページに収めるため)。 */
export async function shot(page: Page, name: string, marks: { loc: Locator; n: number; pad?: number }[] = [], opts: { fullPage?: boolean; maxH?: number } = {}) {
  await page.waitForTimeout(600);
  await mark(page, marks);
  await page.waitForTimeout(150);
  const fullPage = opts.fullPage ?? true;
  if (fullPage) {
    const w = page.viewportSize()!.width;
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, opts.maxH ?? 1250) } });
  } else {
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
  await clearMarks(page);
}

/** デモ動画の字幕 (画面の下)。 */
export async function caption(page: Page, text: string) {
  await page.evaluate((text) => {
    let el = document.getElementById('manual-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'manual-caption';
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', maxWidth: '86%', padding: '10px 22px', borderRadius: '12px',
        background: 'rgba(20,30,50,.88)', color: '#fff', font: '700 22px/1.4 "Noto Sans JP", sans-serif', zIndex: '99999', pointerEvents: 'none', textAlign: 'center',
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
  }, text);
}
export const pause = (page: Page, ms = 1400) => page.waitForTimeout(ms);

/** デモ動画の、マウスの動きの表示 (動画には、ふつうマウスが映らない)。 */
export async function withCursor(ctx: import('@playwright/test').BrowserContext) {
  await ctx.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        position: 'fixed', left: '0', top: '0', width: '26px', height: '26px', marginLeft: '-13px', marginTop: '-13px', borderRadius: '50%',
        background: 'rgba(255,122,0,.35)', border: '3px solid #ff7a00', zIndex: '99999', pointerEvents: 'none', transition: 'transform .06s linear',
      });
      document.body.appendChild(dot);
      const move = (e: MouseEvent) => { dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mousedown', () => { dot.style.background = 'rgba(255,122,0,.8)'; }, true);
      window.addEventListener('mouseup', () => { dot.style.background = 'rgba(255,122,0,.35)'; }, true);
    });
  });
}

/** マウスをゆっくり動かして、押す。 */
export async function tap(page: Page, loc: Locator) {
  await loc.first().scrollIntoViewIfNeeded();
  const box = await loc.first().boundingBox();
  if (!box) { await loc.first().click(); return; }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await page.waitForTimeout(250);
  await loc.first().click();
}

/** 動画を保存して、閉じる。 */
export async function saveVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  await video?.saveAs(`${VIDEOS}/${name}.webm`);
}
