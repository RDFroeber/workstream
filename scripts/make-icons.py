#!/usr/bin/env python3
"""Generates the Lines logo, favicon and PWA icons.

The mark: three parallel diagonal strokes with staggered endpoints and a
station node on the centre line — a transit map reduced to its essentials,
matching the metaphor the dashboard uses. Diagonal rather than horizontal so it
never reads as a hamburger menu at small sizes.
"""
import os
import cairosvg

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(OUT, exist_ok=True)

BG = '#1B2E38'          # deep slate-teal, darker sibling of the app accent
L1 = '#FFFFFF'          # white
L2 = '#6FD3AE'          # light seafoam
L3 = '#F2A360'          # light orange

def mark(size=64, bg=True, radius=14, node=True, pad=0):
    """Return SVG for the mark on a `size` viewBox."""
    s = size
    bg_el = (
        f'<rect x="0" y="0" width="{s}" height="{s}" rx="{radius}" fill="{BG}"/>'
        if bg else ''
    )
    # Three parallel strokes running lower-left to upper-right at 45 degrees,
    # each offset along the perpendicular and staggered in length.
    strokes = [
        # (x1, y1, x2, y2, color, width)
        (13, 45, 40, 18, L2, 6),
        (19, 51, 51, 19, L1, 6),
        (28, 52, 52, 28, L3, 6),
    ]
    parts = [bg_el]
    for x1, y1, x2, y2, c, w in strokes:
        parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" '
            f'stroke-width="{w}" stroke-linecap="round"/>'
        )
    if node:
        # Station node on the centre (white) line.
        parts.append(f'<circle cx="35" cy="35" r="6.5" fill="{BG}"/>')
        parts.append(
            f'<circle cx="35" cy="35" r="4" fill="none" stroke="{L1}" stroke-width="3"/>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        f'width="{s}" height="{s}">' + ''.join(parts) + '</svg>'
    )


def maskable():
    """Android maskable icon: same mark, but inset so a circular crop is safe.

    The spec reserves the outer 10% on each edge, so the art is scaled to ~72%
    and centred on a full-bleed background.
    """
    inner = mark(64, bg=False, node=True)
    inner = inner.split('>', 1)[1].rsplit('</svg>', 1)[0]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">'
        f'<rect width="64" height="64" fill="{BG}"/>'
        f'<g transform="translate(32,32) scale(0.72) translate(-32,-32)">{inner}</g>'
        '</svg>'
    )


def simple():
    """Stripped-back version for 16/32px: no node, wider gaps.

    At 16px a stroke is only ~2.5px, so the gaps between the three lines have to
    be built explicitly. Lines run at 45 degrees, so a line is x + y = c and the
    perpendicular gap between two lines is (c2 - c1) / sqrt(2). With stroke 10
    and c-spacing 23, the visible gap is 23/1.414 - 10 = 6.3 units, which holds
    up as roughly 1.5px at 16 wide.
    """
    import math
    W = 10.0
    SPACING = 23.0
    parts = [f'<rect x="0" y="0" width="64" height="64" rx="12" fill="{BG}"/>']
    # (c offset from centre, half-length along the line, colour)
    for dc, half, colour in ((-SPACING, 15, L2), (0, 19, L1), (SPACING, 15, L3)):
        c = 64 + dc
        mx, my = c / 2, c / 2
        dx = half / math.sqrt(2)
        x1, y1 = mx - dx, my + dx
        x2, y2 = mx + dx, my - dx
        parts.append(
            f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
            f'stroke="{colour}" stroke-width="{W}" stroke-linecap="round"/>'
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        + ''.join(parts) + '</svg>'
    )


if __name__ == '__main__':
    # Scalable favicon + the source logo
    with open(os.path.join(OUT, 'favicon.svg'), 'w') as f:
        f.write(simple())
    with open(os.path.join(OUT, 'logo.svg'), 'w') as f:
        f.write(mark(512))

    # Raster favicons use the simplified mark; app icons use the full one.
    for px in (16, 32, 48):
        cairosvg.svg2png(bytestring=simple().encode(), write_to=os.path.join(OUT, f'favicon-{px}.png'),
                         output_width=px, output_height=px)
    for px, name in ((180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')):
        cairosvg.svg2png(bytestring=mark(512).encode(), write_to=os.path.join(OUT, name),
                         output_width=px, output_height=px)
    cairosvg.svg2png(bytestring=maskable().encode(),
                     write_to=os.path.join(OUT, 'icon-maskable-512.png'),
                     output_width=512, output_height=512)
    print('icons written to', os.path.abspath(OUT))
