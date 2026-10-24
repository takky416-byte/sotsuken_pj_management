import { describe, expect, it } from 'vitest';
import { shortcutFor } from './shortcut';

const URL = 'https://sotsuken-pj.web.app/';
describe('shortcutFor', () => {
  it('Windows は .url。URL と改行 (CRLF) が正しい', () => {
    const f = shortcutFor('desktop', URL)!;
    expect(f.filename).toBe('卒研PJ管理.url');
    expect(f.content).toBe(`[InternetShortcut]\r\nURL=${URL}\r\n`);
  });
  it('Mac は .webloc (plist)。記号は無害にする', () => {
    const f = shortcutFor('mac', 'https://example.com/?a=1&b=2')!;
    expect(f.filename).toBe('卒研PJ管理.webloc');
    expect(f.content).toContain('<string>https://example.com/?a=1&amp;b=2</string>');
    expect(f.content).toContain('<key>URL</key>');
  });
  it('スマホには、ショートカットのファイルを作らない', () => {
    expect(shortcutFor('ios', URL)).toBeNull();
    expect(shortcutFor('android', URL)).toBeNull();
  });
});
