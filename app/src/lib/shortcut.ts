// パソコンのデスクトップに置く、このアプリへのショートカットのファイル。
// ブラウザは、デスクトップに直接ファイルを作れないので、ダウンロードしてもらい、デスクトップにドラッグしてもらう。
import type { Platform } from './bookmark';

export type ShortcutFile = { filename: string; mime: string; content: string };

const NAME = '卒研PJ管理';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Windows: インターネット ショートカット (.url)。Mac: .webloc。パソコン以外は、null */
export function shortcutFor(platform: Platform, url: string): ShortcutFile | null {
  if (platform === 'desktop') {
    return { filename: `${NAME}.url`, mime: 'application/internet-shortcut', content: `[InternetShortcut]\r\nURL=${url}\r\n` };
  }
  if (platform === 'mac') {
    return {
      filename: `${NAME}.webloc`, mime: 'application/xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${esc(url)}</string>\n</dict>\n</plist>\n`,
    };
  }
  return null;
}
