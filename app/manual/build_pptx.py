"""説明資料 (PPTX) を作る。画面写真・手順・デモ動画は、操作マニュアルと同じ (manual/content.json)。"""
import json, os, subprocess, tempfile
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

c = json.load(open('manual/content.json', encoding='utf-8'))
OUT = '../docs/manual'
AC, FG, MUTED, HOT, SOFT = RGBColor(0x0A, 0x84, 0xFF), RGBColor(0x14, 0x22, 0x3A), RGBColor(0x5A, 0x6A, 0x85), RGBColor(0xFF, 0x7A, 0x00), RGBColor(0xE8, 0xF2, 0xFF)
FONT = 'Noto Sans JP'

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
blank = prs.slide_layouts[6]


def text(slide, x, y, w, h, s, size=18, bold=False, color=FG, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = s
    r.font.size, r.font.bold, r.font.color.rgb, r.font.name = Pt(size), bold, color, FONT
    return tb


def header(slide, title, sub=None):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.9))
    bar.fill.solid(); bar.fill.fore_color.rgb = AC; bar.line.fill.background()
    text(slide, 0.5, 0.12, 12, 0.7, title, 28, True, RGBColor(255, 255, 255), anchor=MSO_ANCHOR.MIDDLE)
    if sub:
        text(slide, 0.5, 1.0, 12.3, 0.8, sub, 16, False, MUTED)


def badge(slide, x, y, n):
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(0.42), Inches(0.42))
    s.fill.solid(); s.fill.fore_color.rgb = HOT; s.line.fill.background()
    tf = s.text_frame; tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = str(n); r.font.size = Pt(16); r.font.bold = True; r.font.color.rgb = RGBColor(255, 255, 255); r.font.name = FONT
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE


def picture(slide, path, x, y, w, h):
    with Image.open(path) as im:
        iw, ih = im.size
    r = min(w / iw, h / ih)
    pw, ph = iw * r, ih * r
    slide.shapes.add_picture(path, Inches(x + (w - pw) / 2), Inches(y + (h - ph) / 2), Inches(pw), Inches(ph))
    return x + (w - pw) / 2, y + (h - ph) / 2, pw, ph


def bullets(slide, x, y, w, items, size=17):
    for i, t in enumerate(items):
        badge(slide, x, y + i * 0.95, i + 1)
        text(slide, x + 0.55, y + i * 0.95 - 0.05, w - 0.55, 0.9, t, size)


# 表紙
s = prs.slides.add_slide(blank)
bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height); bg.fill.solid(); bg.fill.fore_color.rgb = AC; bg.line.fill.background()
text(s, 1, 2.2, 11.3, 1.2, c['title'], 44, True, RGBColor(255, 255, 255), PP_ALIGN.CENTER)
text(s, 1, 3.4, 11.3, 0.8, c['subtitle'] + ' 説明資料', 28, False, RGBColor(255, 255, 255), PP_ALIGN.CENTER)
text(s, 2, 4.8, 9.3, 1.4, c['lead'], 16, False, RGBColor(0xE8, 0xF2, 0xFF), PP_ALIGN.CENTER)

# まずはこの4つ
s = prs.slides.add_slide(blank); header(s, 'まずはこの4つ', 'これだけ覚えれば、使い始められます')
for i, st in enumerate(c['start']):
    x, y = 0.6 + (i % 2) * 6.2, 1.9 + (i // 2) * 2.5
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(5.9), Inches(2.2)); box.fill.solid(); box.fill.fore_color.rgb = SOFT; box.line.color.rgb = RGBColor(0xD7, 0xE2, 0xF2)
    text(s, x + 0.25, y + 0.2, 5.4, 0.6, st['t'], 22, True, AC)
    text(s, x + 0.25, y + 0.9, 5.4, 1.2, st['d'], 18)

# 各章
for sec in c['sections']:
    for k, sh in enumerate(sec['shots']):
        s = prs.slides.add_slide(blank); header(s, sec['title'] + ' — ' + sh['cap'])
        top = 1.1
        if k == 0:  # 最初の写真の上に、章の説明を添える
            text(s, 0.5, 1.0, 12.3, 0.7, sec['lead'], 14, False, MUTED)
            top = 1.7
        path = f"manual/out/shots/{sh['file']}.png"
        phone = 'phone' in sh['file']
        if sh['marks']:
            picture(s, path, 0.4, top, 8.3, 7.2 - top)
            bullets(s, 9.0, top + 0.3, 4.0, sh['marks'], 15)
        else:
            picture(s, path, 0.4 if not phone else 4.5, top, 12.5 if not phone else 4.3, 7.2 - top)
    if sec.get('notes'):
        s = prs.slides.add_slide(blank); header(s, sec['title'] + ' — ポイント')
        for i, n in enumerate(sec['notes']):
            text(s, 0.8, 1.4 + i * 1.5, 11.8, 1.4, '● ' + n, 20)

# デモ動画
mp4s = [v for v in c['videos'] if os.path.exists(f"{OUT}/{v['file']}.mp4")]
for v in mp4s:
    s = prs.slides.add_slide(blank); header(s, '操作デモ — ' + v['t'], v['d'])
    mp4 = f"{OUT}/{v['file']}.mp4"
    poster = os.path.join(tempfile.gettempdir(), v['file'] + '.png')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', '3', '-i', mp4, '-frames:v', '1', poster], check=True)
    s.shapes.add_movie(mp4, Inches(1.9), Inches(1.9), Inches(9.5), Inches(5.34), poster_frame_image=poster, mime_type='video/mp4')

# 困ったとき
s = prs.slides.add_slide(blank); header(s, '困ったとき')
for i, f in enumerate(c['faq']):
    y = 1.2 + i * 1.2
    text(s, 0.6, y, 12, 0.4, f['q'], 18, True, AC)
    text(s, 0.6, y + 0.38, 12.1, 0.8, f['a'], 14, False, FG)

prs.save(f"{OUT}/卒研PJ管理_説明資料_学生編.pptx")
print('pptx built')
