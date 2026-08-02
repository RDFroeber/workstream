#!/usr/bin/env python3
"""Generates the Lines favicon and PWA icons from the app's logo mark.

The mark is the same waypoints glyph the header uses (Lucide, ISC licensed) —
four nodes joined by two diagonals and a horizontal run, which is the app's
metaphor in miniature. Keeping the icon and the header identical matters more
than having a bespoke mark.

Usage:  python3 scripts/make-icons.py [--light]
        --light renders dark-ink-on-white instead of the default inverted icon.
"""
import os
import sys
import cairosvg

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(OUT, exist_ok=True)

DARK_BG = '#1B2E38'   # deep slate-teal, sibling of the app accent
INK = '#1B2430'       # the header's ink colour
LIGHT_BG = '#FFFFFF'
ACCENT = '#6FD3AE'    # light seafoam, picks out one node

# Lucide "waypoints", verbatim: 24x24 viewBox, stroke-width 2, round caps.
NODES = [(12, 4.5), (4.5, 12), (19.5, 12), (12, 19.5)]
NODE_R = 2.6   # a hair over the native 2.5 so the ring holes survive rasterising
EDGES = ['m10.2 6.3-3.9 3.9', 'M7 12h10', 'm13.8 17.7 3.9-3.9']


def glyph(stroke, stroke_width=2.0, accent_node=None, accent=ACCENT):
    """The mark on its native 24x24 grid."""
    parts = []
    for d in EDGES:
        parts.append(
            f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{stroke_width}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
    for i, (cx, cy) in enumerate(NODES):
        colour = accent if accent_node == i else stroke
        parts.append(
            f'<circle cx="{cx}" cy="{cy}" r="{NODE_R}" fill="none" stroke="{colour}" '
            f'stroke-width="{stroke_width}" stroke-linecap="round"/>'
        )
    return ''.join(parts)


def icon(scale=1.72, stroke_width=2.0, bg=DARK_BG, stroke='#FFFFFF', radius=14,
         accent_node=2, size=512):
    """Full icon: the mark centred on a rounded square."""
    inner = glyph(stroke, stroke_width, accent_node)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        f'width="{size}" height="{size}">'
        f'<rect width="64" height="64" rx="{radius}" fill="{bg}"/>'
        f'<g transform="translate(32,32) scale({scale}) translate(-12,-12)">{inner}</g>'
        '</svg>'
    )


def favicon(bg=DARK_BG, stroke='#FFFFFF'):
    """Favicon build of the same mark, retuned for 16px.

    The mark can't be scaled down naively. At 2.0 stroke the ring holes come out
    around half a device pixel and cairo fills them in, so the whole thing
    renders as a solid cross. Thinning the stroke to 1.4 and scaling to 2.45
    keeps every hole open at 16px, which is what makes it read as four nodes
    rather than a blob. Verified against the actual rasterised pixels, not by eye
    on the SVG.
    """
    # No accent node here: at 16px the seafoam ring rasterises lighter than the
    # white ones and the imbalance reads as a rendering fault. The large icons
    # keep it, where it reads as deliberate.
    inner = glyph(stroke, 1.4, accent_node=None)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="12" fill="{bg}"/>'
        f'<g transform="translate(32,32) scale(2.45) translate(-12,-12)">{inner}</g>'
        '</svg>'
    )


def maskable(bg=DARK_BG, stroke='#FFFFFF'):
    """Android maskable: art inset to ~72% so any launcher crop is safe."""
    inner = glyph(stroke, 2.0, accent_node=2)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">'
        f'<rect width="64" height="64" fill="{bg}"/>'
        f'<g transform="translate(32,32) scale(1.24) translate(-12,-12)">{inner}</g>'
        '</svg>'
    )


def wordmark(stroke=INK):
    """Header lockup: mark plus the name, for READMEs and share previews."""
    inner = glyph(stroke, 2.0)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132 32" width="264" height="64">'
        f'<g transform="translate(4,4) scale(1)">{inner}</g>'
        f'<text x="34" y="22" font-family="Space Grotesk, system-ui, sans-serif" '
        f'font-size="19" font-weight="600" fill="{stroke}">Lines</text>'
        '</svg>'
    )


if __name__ == '__main__':
    light = '--light' in sys.argv
    bg = LIGHT_BG if light else DARK_BG
    stroke = INK if light else '#FFFFFF'

    with open(os.path.join(OUT, 'favicon.svg'), 'w') as f:
        f.write(favicon(bg, stroke))
    with open(os.path.join(OUT, 'logo.svg'), 'w') as f:
        f.write(icon(bg=bg, stroke=stroke))
    with open(os.path.join(OUT, 'wordmark.svg'), 'w') as f:
        f.write(wordmark())

    for px in (16, 32, 48):
        cairosvg.svg2png(bytestring=favicon(bg, stroke).encode(),
                         write_to=os.path.join(OUT, f'favicon-{px}.png'),
                         output_width=px, output_height=px)
    for px, name in ((180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')):
        cairosvg.svg2png(bytestring=icon(bg=bg, stroke=stroke).encode(),
                         write_to=os.path.join(OUT, name), output_width=px, output_height=px)
    cairosvg.svg2png(bytestring=maskable(bg, stroke).encode(),
                     write_to=os.path.join(OUT, 'icon-maskable-512.png'),
                     output_width=512, output_height=512)

    from PIL import Image
    imgs = [Image.open(os.path.join(OUT, f'favicon-{s}.png')).convert('RGBA') for s in (16, 32, 48)]
    imgs[2].save(os.path.join(OUT, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print('icons written to', os.path.abspath(OUT), '(light)' if light else '(dark)')
