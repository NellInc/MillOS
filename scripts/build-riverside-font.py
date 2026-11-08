"""Build public/fonts/RiversideRosario-Regular.ttf, the Riverside station lettering.

Riverside's signs follow Translink Northern Ireland's 2003-2021 lettering,
Monotype's Ocean Sans (Ong Chong Wah, 1993). Ocean Sans is commercial, so the
station uses Rosario (Omnibus-Type, SIL OFL 1.1, no Reserved Font Name), the
closest freely licensed humanist sans found: tapered strokes, open apertures
and a similar Book weight. Ocean Sans dots its i and j with a diamond; this
build gives Rosario the same tittle.

Steps: a static Regular instance of the variable font (wght 400), each round
tittle on i, j, ij and iogonek replaced by a square turned 45 degrees about
the same centre, a Latin subset with no hinting (hinting programs index points
that changed), and the family renamed as the OFL asks of a modified version.
The output must stay TrueType (glyf): troika's parser hangs on some CFF fonts
and blanks the 3D scene (SceneText.tsx).

Usage (fontTools 4.x):
  curl -L -o Rosario.ttf 'https://github.com/google/fonts/raw/main/ofl/rosario/Rosario%5Bwght%5D.ttf'
  python3 -I scripts/build-riverside-font.py Rosario.ttf public/fonts/RiversideRosario-Regular.ttf
The licence travels beside it as public/fonts/RiversideRosario-OFL.txt.
"""

import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from fontTools.ttLib.tables.ttProgram import Program
from fontTools.varLib import instancer

FAMILY = 'Riverside Rosario'
POSTSCRIPT = 'RiversideRosario-Regular'
DOTTED = ('i', 'j', 'ij', 'iogonek')
# Half-diagonal of the diamond as a share of the round dot's width: a touch
# wider than the dot, as Ocean Sans's is.
DIAMOND_SCALE = 0.66


def signed_area(points):
    total = 0
    for i, (x0, y0) in enumerate(points):
        x1, y1 = points[(i + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return total / 2


def diamond_tittles(font):
    glyf = font['glyf']
    x_height = font['OS/2'].sxHeight
    half = None
    for name in DOTTED:
        glyph = glyf[name]
        coords, ends, flags = glyph.getCoordinates(glyf)
        contours, start = [], 0
        for end in ends:
            contours.append((list(coords[start:end + 1]), list(flags[start:end + 1])))
            start = end + 1
        dots = [c for c in contours if min(y for _, y in c[0]) > x_height]
        if not dots:
            raise SystemExit(f'{name}: no tittle above x-height {x_height}')
        points, point_flags, end_points = [], [], []
        for contour, contour_flags in contours:
            if any(contour is dot for dot, _ in dots):
                continue
            points += contour
            point_flags += contour_flags
            end_points.append(len(points) - 1)
        for dot, _ in dots:
            xs = [x for x, _ in dot]
            ys = [y for _, y in dot]
            cx = round((min(xs) + max(xs)) / 2)
            cy = round((min(ys) + max(ys)) / 2)
            # One size for every tittle, taken from the plain i.
            if half is None:
                half = round((max(xs) - min(xs)) * DIAMOND_SCALE)
            diamond = [(cx, cy + half), (cx + half, cy), (cx, cy - half), (cx - half, cy)]
            # Same winding as the dot it replaces, so it fills the same way.
            if (signed_area(diamond) > 0) != (signed_area(dot) > 0):
                diamond.reverse()
            points += diamond
            point_flags += [1, 1, 1, 1]
            end_points.append(len(points) - 1)
            print(f'{name}: diamond at ({cx}, {cy}), half-diagonal {half}')
        glyph.coordinates = GlyphCoordinates(points)
        glyph.flags = bytearray(point_flags)
        glyph.endPtsOfContours = end_points
        glyph.numberOfContours = len(end_points)
        glyph.program = Program()
        glyph.program.fromBytecode(b'')
        glyph.recalcBounds(glyf)


def main(source, output):
    font = instancer.instantiateVariableFont(TTFont(source), {'wght': 400})
    diamond_tittles(font)

    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']  # type: ignore[assignment]  # fontTools accepts '*' (all)
    options.hinting = False
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(
        unicodes=list(range(0x20, 0x7F))
        + list(range(0xA0, 0x180))
        + list(range(0x2000, 0x2070))
        + [0x20AC, 0x2122]
    )
    subsetter.subset(font)

    names = font['name']
    for record in names.names:
        if record.nameID in (1, 16):
            record.string = FAMILY
        elif record.nameID == 2:
            record.string = 'Regular'
        elif record.nameID == 3:
            record.string = f'1.000;MillOS;{POSTSCRIPT}'
        elif record.nameID == 4:
            record.string = f'{FAMILY} Regular'
        elif record.nameID == 6:
            record.string = POSTSCRIPT
    names.setName(
        'Modified by MillOS from Rosario (Omnibus-Type, SIL OFL 1.1): static Regular '
        'instance, Latin subset, diamond tittles on i and j.',
        10, 3, 1, 0x409,
    )
    strip_unreadable_gsub(font)
    font.recalcBBoxes = True
    font.save(output)


# Contextual GSUB subtables troika's Typr parser cannot read. It skips them and
# logs "unsupported GSUB table LookupType" for each, so they only add noise.
UNREADABLE_GSUB = {(5, 1), (5, 2), (5, 3), (6, 1), (6, 2)}


def strip_unreadable_gsub(font):
    if 'GSUB' not in font:
        return
    for lookup in font['GSUB'].table.LookupList.Lookup:
        kept = []
        for table in lookup.SubTable:
            kind, inner = lookup.LookupType, table
            if kind == 7:
                kind, inner = table.ExtSubTable.LookupType, table.ExtSubTable
            if (kind, getattr(inner, 'Format', None)) not in UNREADABLE_GSUB:
                kept.append(table)
        lookup.SubTable = kept
        lookup.SubTableCount = len(kept)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
