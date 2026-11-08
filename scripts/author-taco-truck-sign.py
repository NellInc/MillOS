"""Author public/textures/signage/taco-truck-la-molinita-v1.webp, the taco truck's sign atlas.

The truck on the station forecourt sells as "La Molinita" ("the little mill"),
an invented name: a corn-tortilla stall beside a flour mill. The atlas holds
three painted faces, drawn here so every pixel can be rebuilt:

  A  roof board, 3.2 x 1.0 m, its top a cos^2 hump from 0.8 m at the ends
  B  awning valance, 1.8 x 0.3 m
  C  A-frame chalk menu, 0.56 x 0.78 m

`src/components/exterior/tacoTruckSignLayout.ts` holds the same rectangles and
the same board outline; `tacoTruckSignLayout.test.ts` checks that they agree
with this file and with the delivered image.

Lettering is Shrikhand (Jonny Pinhorn, SIL OFL 1.1, no Reserved Font Name) and
the chalk menu Caveat Brush (Impallari Type, SIL OFL 1.1, no Reserved Font
Name). Neither font ships: the letters are painted into the image, which the
OFL does not restrict. Everything else (taco, sunburst, ribbon, grain) is
drawn below from plain shapes and seeded noise.

Usage (Pillow with WebP, numpy):
  curl -L -o Shrikhand-Regular.ttf \
    'https://raw.githubusercontent.com/google/fonts/0cffc716084fe004545f47e7f77a007f26d3ca88/ofl/shrikhand/Shrikhand-Regular.ttf'
  curl -L -o CaveatBrush-Regular.ttf \
    'https://raw.githubusercontent.com/google/fonts/b05d7ed92bc2424f4dd1d2c5861a423868dea932/ofl/caveatbrush/CaveatBrush-Regular.ttf'
  python3 -I scripts/author-taco-truck-sign.py Shrikhand-Regular.ttf CaveatBrush-Regular.ttf \
    public/textures/signage/taco-truck-la-molinita-v1.webp
"""

import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Atlas, in output pixels (image y down).
ATLAS = (2048, 1024)
# name: (x, y, w, h)
REGIONS = {
    'board': (0, 0, 2048, 640),
    'valance': (0, 656, 1536, 256),
    'menu': (1600, 656, 253, 352),
}
# Roof board outline in metres; must match tacoTruckSignLayout.ts.
BOARD_W, BOARD_H, BOARD_SHOULDER, BOARD_CORNER = 3.2, 1.0, 0.8, 0.06
SS = 2  # supersampling

TEAL = (23, 122, 132)
TEAL_LIGHT = (33, 142, 150)
TEAL_DEEP = (14, 86, 96)
MARIGOLD = (242, 167, 27)
MAROON = (110, 22, 24)
INK = (52, 22, 16)
CREAM = (255, 241, 214)
CREAM_WARM = (255, 214, 140)
MAGENTA = (206, 56, 108)
CHALKBOARD = (31, 46, 40)
CHALK = (240, 237, 226)

rng = np.random.default_rng(20261107)


def board_top(x):
    """Board top edge (metres) at x, centred on the board."""
    return BOARD_SHOULDER + (BOARD_H - BOARD_SHOULDER) * math.cos(math.pi * x / BOARD_W) ** 2


def board_outline(inset=0.0, samples=48):
    """The board outline in metres, inset by `inset` on every side (approximate offset)."""
    w, r = BOARD_W / 2 - inset, max(BOARD_CORNER - inset * 0.5, 0.01)
    pts = []
    for i in range(7):
        a = -math.pi / 2 + (i / 6) * (math.pi / 2)
        pts.append((w - r + r * math.cos(a), inset + r + r * math.sin(a)))
    for i in range(samples + 1):
        x = w - 2 * w * i / samples
        pts.append((x, board_top(x) - inset))
    for i in range(7):
        a = math.pi + (i / 6) * (math.pi / 2)
        pts.append((-w + r + r * math.cos(a), inset + r + r * math.sin(a)))
    return pts


def to_px(pts, rect):
    x0, y0, w, h = rect
    return [
        (SS * (x0 + (x + BOARD_W / 2) / BOARD_W * w), SS * (y0 + (1 - y / BOARD_H) * h))
        for x, y in pts
    ]


def font(path, size):
    return ImageFont.truetype(path, size * SS)


def grain(img, mask, amount=5.0, mottle=7.0, streak=3.0):
    """Painted-surface noise: fine grain, soft mottling and horizontal brush drag."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    fine = rng.normal(0, amount, (h, w))
    low = Image.fromarray(np.uint8(np.clip(rng.normal(128, 60, (h // 32 + 1, w // 32 + 1)), 0, 255)))
    low = np.asarray(low.resize((w, h), Image.BICUBIC)).astype(np.float32) - 128
    brush = Image.fromarray(np.uint8(np.clip(rng.normal(128, 70, (h // 2 + 1, w // 48 + 1)), 0, 255)))
    brush = np.asarray(brush.resize((w, h), Image.BICUBIC)).astype(np.float32) - 128
    n = fine + low / 60 * mottle + brush / 70 * streak
    m = np.asarray(mask).astype(np.float32)[..., None] / 255
    a[..., :3] = np.clip(a[..., :3] + n[..., None] * m, 0, 255)
    return Image.fromarray(a.astype(np.uint8), img.mode)


def painted_text(img, xy, text, fnt, fill, outline, shadow, stroke, depth, anchor='mm', gradient=None):
    """Sign-painter lettering: a block shadow, an outline, then the face."""
    d = ImageDraw.Draw(img)
    x, y = xy
    for k in range(depth, 0, -1):
        d.text((x + k, y + k), text, font=fnt, fill=shadow, anchor=anchor,
               stroke_width=stroke, stroke_fill=shadow)
    d.text((x, y), text, font=fnt, fill=outline, anchor=anchor, stroke_width=stroke,
           stroke_fill=outline)
    if gradient is None:
        d.text((x, y), text, font=fnt, fill=fill, anchor=anchor)
        return
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).text((x, y), text, font=fnt, fill=255, anchor=anchor)
    box = mask.getbbox()
    if not box:
        return
    top, bottom = box[1], box[3]
    ramp = np.linspace(0, 1, bottom - top)[:, None]
    face = np.zeros((img.size[1], img.size[0], 3), np.float32)
    face[:] = fill
    band = np.array(fill, np.float32) * (1 - ramp) + np.array(gradient, np.float32) * ramp
    face[top:bottom] = band[:, None, :]
    img.paste(Image.fromarray(face.astype(np.uint8)), (0, 0), mask)


def fit_font(path, text, max_w, size):
    while size > 8:
        f = font(path, size)
        if f.getbbox(text)[2] - f.getbbox(text)[0] <= max_w:
            return f
        size -= 2
    return font(path, size)


def taco_layer(size):
    """A hard-shell taco in side view on a transparent layer `size` px square."""
    s = size
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, top = s / 2, s * 0.46
    r = s * 0.44
    rv = r * 0.78  # the fold is wider than it is deep
    lw = max(2, int(s * 0.022))
    # The far half of the folded tortilla rises behind the filling.
    d.pieslice([cx - r * 0.96, top - rv * 0.62, cx + r * 0.96, top + rv * 0.62], 180, 360,
               fill=(214, 140, 38), outline=INK, width=lw)
    # Fillings ride above the shell's open top.
    for i in range(9):
        t = i / 8
        x = cx - r * 0.86 + t * r * 1.72
        hump = math.sin(math.pi * t) * s * 0.07
        d.ellipse([x - s * 0.085, top - s * 0.06 - hump, x + s * 0.085, top + s * 0.05],
                  fill=(122, 58, 26), outline=INK, width=lw)
    lettuce = []
    for i in range(23):
        t = i / 22
        x = cx - r * 0.95 + t * r * 1.9
        lift = math.sin(math.pi * t) * s * 0.11 + (s * 0.05 if i % 2 else 0)
        lettuce.append((x, top - lift))
    lettuce += [(cx + r * 0.95, top + s * 0.03), (cx - r * 0.95, top + s * 0.03)]
    d.polygon(lettuce, fill=(98, 176, 58), outline=INK, width=lw)
    for i, t in enumerate((0.18, 0.36, 0.55, 0.74)):
        x = cx - r * 0.8 + t * r * 1.6
        y = top - math.sin(math.pi * t) * s * 0.1 - s * 0.03
        d.ellipse([x - s * 0.05, y - s * 0.05, x + s * 0.05, y + s * 0.05],
                  fill=(222, 62, 44), outline=INK, width=lw)
        if i % 2 == 0:
            d.rectangle([x + s * 0.06, y - s * 0.015, x + s * 0.1, y + s * 0.02], fill=(250, 248, 236))
    for t in (0.25, 0.47, 0.66, 0.84):
        x = cx - r * 0.8 + t * r * 1.6
        y = top - math.sin(math.pi * t) * s * 0.12 - s * 0.06
        d.line([x - s * 0.04, y, x + s * 0.03, y - s * 0.03], fill=(255, 196, 46), width=lw * 2)
    # Shell: the lower half disc, a darker inner lip, toasted speckles.
    d.pieslice([cx - r, top - rv, cx + r, top + rv], 0, 180, fill=(241, 176, 52), outline=INK, width=lw)
    d.chord([cx - r * 0.97, top - rv * 0.18, cx + r * 0.97, top + rv * 0.18], 0, 180,
            fill=(206, 128, 34))
    d.line([cx - r, top, cx + r, top], fill=INK, width=lw)
    for _ in range(26):
        a = rng.uniform(0.15, math.pi - 0.15)
        rr = rng.uniform(0.3, 0.88)
        x, y = cx + rr * r * math.cos(a), top + rr * rv * math.sin(a)
        if y < top + rv * 0.22:
            continue
        q = s * 0.012
        d.ellipse([x - q, y - q, x + q, y + q], fill=(192, 112, 30))
    # Shine along the shell.
    d.arc([cx - r * 0.82, top - rv * 0.82, cx + r * 0.82, top + rv * 0.82], 30, 70,
          fill=(255, 226, 150), width=lw * 2)
    return layer


def paste_taco(img, centre, size, angle):
    layer = taco_layer(size).rotate(angle, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(layer, (int(centre[0] - layer.width / 2), int(centre[1] - layer.height / 2)))


def draw_board(img, shrikhand):
    rect = REGIONS['board']
    x0, y0, w, h = rect
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    outer = to_px(board_outline(0.0), rect)
    # Bleed: the field runs past the outline so the mesh edge never samples the gutter.
    d.rectangle([x0 * SS, y0 * SS, (x0 + w) * SS, (y0 + h) * SS], fill=MARIGOLD)
    d.polygon(to_px(board_outline(-0.02), rect), fill=INK)
    d.polygon(outer, fill=MARIGOLD)
    d.polygon(to_px(board_outline(0.042), rect), fill=INK)
    d.polygon(to_px(board_outline(0.05), rect), fill=CREAM)
    field_pts = to_px(board_outline(0.062), rect)
    d.polygon(field_pts, fill=TEAL)
    field_mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(field_mask).polygon(field_pts, fill=255)
    # Sunburst from below the ribbon.
    rays = Image.new('RGBA', img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    ox, oy = (x0 + w / 2) * SS, (y0 + h * 0.86) * SS
    for i in range(24):
        a0 = math.pi + i * math.pi / 12
        a1 = a0 + math.pi / 24
        far = w * SS
        rd.polygon([(ox, oy), (ox + far * math.cos(a0), oy + far * math.sin(a0)),
                    (ox + far * math.cos(a1), oy + far * math.sin(a1))], fill=TEAL_LIGHT + (255,))
    layer.paste(rays, (0, 0), Image.composite(rays.getchannel('A'), Image.new('L', img.size, 0), field_mask))
    # Soft vignette toward the field edge.
    edge = field_mask.filter(ImageFilter.GaussianBlur(28 * SS))
    shade = Image.new('RGBA', img.size, TEAL_DEEP + (255,))
    inv = Image.eval(edge, lambda v: int(max(0, 150 - v * 150 / 255)))
    layer.paste(shade, (0, 0), Image.composite(inv, Image.new('L', img.size, 0), field_mask))
    # Small marigold stars in the shoulders.
    for sx, sy in ((0.235, 0.24), (0.765, 0.24), (0.5, 0.08)):
        px, py, rr = (x0 + w * sx) * SS, (y0 + h * sy) * SS, 16 * SS
        star = [(px + (rr if k % 2 == 0 else rr * 0.42) * math.cos(-math.pi / 2 + k * math.pi / 5),
                 py + (rr if k % 2 == 0 else rr * 0.42) * math.sin(-math.pi / 2 + k * math.pi / 5))
                for k in range(10)]
        d.polygon(star, fill=MARIGOLD, outline=INK, width=2 * SS)
    # Ribbon under the name.
    rcx, rcy, rw, rh = (x0 + w / 2) * SS, (y0 + h * 0.74) * SS, 860 * SS, 92 * SS
    tail = 70 * SS
    for side in (-1, 1):
        ex = rcx + side * (rw / 2 - 10 * SS)
        d.polygon([(ex, rcy - rh * 0.32), (ex + side * tail * 1.6, rcy - rh * 0.32),
                   (ex + side * tail, rcy + rh * 0.18), (ex + side * tail * 1.6, rcy + rh * 0.68),
                   (ex, rcy + rh * 0.68)], fill=(150, 30, 70), outline=INK, width=3 * SS)
    d.polygon([(rcx - rw / 2, rcy - rh / 2), (rcx + rw / 2, rcy - rh / 2),
               (rcx + rw / 2, rcy + rh / 2), (rcx - rw / 2, rcy + rh / 2)],
              fill=MAGENTA, outline=INK, width=3 * SS)
    img.alpha_composite(layer)
    sub = fit_font(shrikhand, 'TACOS DE MAÍZ', rw - 120 * SS, 64)
    painted_text(img, (rcx, rcy - 4 * SS), 'TACOS DE MAÍZ', sub, CREAM, INK, MAROON, 3 * SS, 4 * SS)
    name = fit_font(shrikhand, 'La Molinita', 1300 * SS, 240)
    painted_text(img, ((x0 + w / 2) * SS, (y0 + h * 0.43) * SS), 'La Molinita', name, CREAM,
                 INK, MAROON, 9 * SS, 16 * SS, gradient=CREAM_WARM)
    # A taco at each end, tipped toward the name.
    paste_taco(img, ((x0 + w * 0.11) * SS, (y0 + h * 0.58) * SS), 300 * SS, 12)
    paste_taco(img, ((x0 + w * 0.89) * SS, (y0 + h * 0.58) * SS), 300 * SS, -12)
    paint = Image.new('L', img.size, 0)
    ImageDraw.Draw(paint).polygon(to_px(board_outline(-0.03), rect), fill=255)
    return paint


def draw_valance(img, shrikhand):
    x0, y0, w, h = REGIONS['valance']
    d = ImageDraw.Draw(img)
    S = SS
    d.rectangle([(x0 - 8) * S, (y0 - 8) * S, (x0 + w + 8) * S, (y0 + h + 8) * S], fill=MARIGOLD)
    d.rectangle([x0 * S, (y0 + 22) * S, (x0 + w) * S, (y0 + h - 22) * S], fill=INK)
    d.rectangle([x0 * S, (y0 + 28) * S, (x0 + w) * S, (y0 + h - 28) * S], fill=TEAL)
    for i in range(int(w / 64) + 1):
        cx = (x0 + 32 + i * 64) * S
        d.ellipse([cx - 9 * S, (y0 + h - 15) * S, cx + 9 * S, (y0 + h - 3) * S], fill=MAGENTA)
        d.ellipse([cx - 9 * S, (y0 + 3) * S, cx + 9 * S, (y0 + 15) * S], fill=MAGENTA)
    text = 'TACOS  ·  QUESADILLAS  ·  ELOTES'
    f = fit_font(shrikhand, text, (w - 120) * S, 112)
    painted_text(img, ((x0 + w / 2) * S, (y0 + h / 2 - 4) * S), text, f, CREAM, INK, MAROON,
                 4 * S, 6 * S)
    paint = Image.new('L', img.size, 0)
    ImageDraw.Draw(paint).rectangle([x0 * S, y0 * S, (x0 + w) * S, (y0 + h) * S], fill=255)
    return paint


def draw_menu(img, shrikhand, caveat):
    x0, y0, w, h = REGIONS['menu']
    d = ImageDraw.Draw(img)
    S = SS
    d.rectangle([(x0 - 8) * S, (y0 - 8) * S, (x0 + w + 8) * S, (y0 + h + 8) * S], fill=CHALKBOARD)
    # Chalk dust: wiped-off ghosts of earlier menus.
    dust = Image.new('L', img.size, 0)
    dd = ImageDraw.Draw(dust)
    for _ in range(14):
        cx, cy = rng.uniform(x0, x0 + w) * S, rng.uniform(y0, y0 + h) * S
        dd.ellipse([cx - 60 * S, cy - 14 * S, cx + 60 * S, cy + 14 * S], fill=int(rng.uniform(10, 26)))
    dust = dust.filter(ImageFilter.GaussianBlur(10 * S))
    img.paste(Image.new('RGBA', img.size, CHALK + (255,)), (0, 0), dust)
    title = fit_font(shrikhand, 'MENÚ', (w - 40) * S, 58)
    painted_text(img, ((x0 + w / 2) * S, (y0 + 46) * S), 'MENÚ', title, MARIGOLD, CHALKBOARD,
                 CHALKBOARD, 1, 0)
    d.line([(x0 + 30) * S, (y0 + 84) * S, (x0 + w - 30) * S, (y0 + 86) * S], fill=CHALK, width=2 * S)
    items = (('Al pastor', '£3.50'), ('Pollo asado', '£3.50'), ('Hongos', '£3'),
             ('Elote', '£2.50'), ('Horchata', '£2'))
    f = font(caveat, 31)
    for i, (dish, price) in enumerate(items):
        y = (y0 + 112 + i * 40) * S
        d.text(((x0 + 18) * S, y), dish, font=f, fill=CHALK, anchor='lm')
        d.text(((x0 + w - 16) * S, y), price, font=f, fill=(255, 214, 120), anchor='rm')
    paste_taco(img, ((x0 + w / 2) * S, (y0 + h - 26) * S), 56 * S, 0)
    paint = Image.new('L', img.size, 0)
    ImageDraw.Draw(paint).rectangle([x0 * S, y0 * S, (x0 + w) * S, (y0 + h) * S], fill=255)
    return paint


def main():
    shrikhand, caveat, out = sys.argv[1], sys.argv[2], sys.argv[3]
    img = Image.new('RGBA', (ATLAS[0] * SS, ATLAS[1] * SS), (40, 34, 30, 255))
    board = draw_board(img, shrikhand)
    valance = draw_valance(img, shrikhand)
    menu = draw_menu(img, shrikhand, caveat)
    painted = Image.composite(Image.new('L', img.size, 255), board, valance)
    img = grain(img.convert('RGB'), board, 4.0, 7.0, 4.0)
    img = grain(img, valance, 4.0, 5.0, 3.0)
    img = grain(img, menu, 3.0, 4.0, 1.5)
    del painted
    img = img.resize(ATLAS, Image.LANCZOS)
    img.save(out, 'WEBP', quality=80, method=6)


if __name__ == '__main__':
    main()
