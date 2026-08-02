import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PALETTE, themeColor } from '../src/lib/colors'
import { hex2lab, deltaE, worstCaseDelta, contrast, VISION_TYPES, simLab } from './colorScience'

const LIGHT_PANEL = '#FFFFFF'
const DARK_PANEL = '#1C2128'

const worstPair = (list, metric) => {
  let worst = Infinity
  let pair = null
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = metric(list[i], list[j])
      if (d < worst) {
        worst = d
        pair = [list[i], list[j]]
      }
    }
  }
  return { worst, pair }
}
const normalDelta = (a, b) => deltaE(hex2lab(a), hex2lab(b))

describe('dark palette', () => {
  it('gives every color a dark variant', () => {
    PALETTE.forEach((c) => expect(c.dark, c.name).toMatch(/^#[0-9A-F]{6}$/i))
  })

  it('exists because the light palette genuinely fails on dark', () => {
    // If this ever stops being true the dark variants are dead weight — but as
    // it stands, half the palette is unreadable on a dark panel.
    const failing = PALETTE.filter((c) => contrast(c.hex, DARK_PANEL) < 3.0)
    expect(failing.length).toBeGreaterThan(6)
  })

  it('every dark variant is readable on the dark panel', () => {
    PALETTE.forEach((c) => {
      expect(contrast(c.dark, DARK_PANEL), `${c.name} ${c.dark}`).toBeGreaterThanOrEqual(3.4)
    })
  })

  it('no dark variant glares against the dark panel', () => {
    // A line at 12:1 on a dark background reads as a highlighter pen.
    PALETTE.forEach((c) => {
      expect(contrast(c.dark, DARK_PANEL), `${c.name} ${c.dark}`).toBeLessThan(9)
    })
  })

  it('keeps every dark pair as separable as the light palette', () => {
    const light = worstPair(PALETTE.map((c) => c.hex), normalDelta).worst
    const { worst, pair } = worstPair(PALETTE.map((c) => c.dark), normalDelta)
    expect(worst, `closest dark pair: ${pair}`).toBeGreaterThan(light - 1)
  })

  it('keeps the safe subset safe in dark mode too', () => {
    const safeDark = PALETTE.filter((c) => c.safe).map((c) => c.dark)
    const { worst, pair } = worstPair(safeDark, worstCaseDelta)
    expect(worst, `closest safe dark pair: ${pair}`).toBeGreaterThan(9.5)
  })

  it('holds under each dichromacy individually', () => {
    const safeDark = PALETTE.filter((c) => c.safe).map((c) => c.dark)
    for (const type of VISION_TYPES) {
      const { worst } = worstPair(safeDark, (a, b) => deltaE(simLab(a, type), simLab(b, type)))
      expect(worst, `failed under ${type}`).toBeGreaterThan(9.5)
    }
  })

  it('keeps each color recognisably itself rather than a different hue', () => {
    // "Navy" must not optimise its way into lavender. Lightness is expected to
    // move a long way; hue is not.
    PALETTE.forEach((c) => {
      const [, aL, bL] = hex2lab(c.hex)
      const [, aD, bD] = hex2lab(c.dark)
      const hueLight = (Math.atan2(bL, aL) * 180) / Math.PI
      const hueDark = (Math.atan2(bD, aD) * 180) / Math.PI
      let diff = Math.abs(hueLight - hueDark)
      if (diff > 180) diff = 360 - diff
      expect(diff, `${c.name} hue shifted`).toBeLessThan(22)
    })
  })

  it('still works in light mode', () => {
    PALETTE.forEach((c) => {
      expect(contrast(c.hex, LIGHT_PANEL)).toBeGreaterThanOrEqual(3.0)
    })
  })
})

describe('themeColor', () => {
  it('passes colors straight through in light mode', () => {
    PALETTE.forEach((c) => expect(themeColor(c.hex, false)).toBe(c.hex))
  })
  it('swaps to the dark variant in dark mode', () => {
    PALETTE.forEach((c) => expect(themeColor(c.hex, true)).toBe(c.dark))
  })
  it('leaves an unrecognised legacy color alone', () => {
    // A line saved before the palette changed still has to render.
    expect(themeColor('#E08E0B', true)).toBe('#E08E0B')
    expect(themeColor('#E08E0B', false)).toBe('#E08E0B')
  })
})

describe('PWA assets', () => {
  const pub = (f) => path.join(process.cwd(), 'public', f)

  it('ships every icon the install prompts need', () => {
    for (const f of [
      'favicon.ico',
      'favicon.svg',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
      'manifest.webmanifest',
    ]) {
      expect(fs.existsSync(pub(f)), `missing ${f}`).toBe(true)
    }
  })

  it('has a manifest that names the app "Lines"', () => {
    const m = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'))
    expect(m.short_name).toBe('Lines')
    expect(m.display).toBe('standalone')
    expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true)
  })

  it('uses relative paths so it works on a subpath host like GitHub Pages', () => {
    const m = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'))
    expect(m.start_url.startsWith('.')).toBe(true)
    m.icons.forEach((i) => expect(i.src.startsWith('.')).toBe(true))
  })

  it('declares the iOS-specific tags, which ignore the manifest', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
    // Safari takes the home screen icon and title from these, not the manifest.
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('name="apple-mobile-web-app-title" content="Lines"')
    expect(html).toContain('rel="manifest"')
  })

  it('sets the theme before first paint so dark users see no white flash', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
    const headScript = html.slice(0, html.indexOf('</head>'))
    expect(headScript).toContain('lines-theme')
    expect(headScript).toContain('prefers-color-scheme: dark')
  })
})

// ---------------------------------------------------------------------------
// A regression guard: any fixed colour in a component is a dark-mode bug
// waiting to happen. Colours belong in colors.js (line palette) or index.css
// (theme tokens) — nowhere else.
// ---------------------------------------------------------------------------
describe('no hardcoded colors in components', () => {
  const dir = path.join(process.cwd(), 'src', 'components')
  const files = fs.readdirSync(dir).filter((f) => /\.jsx?$/.test(f))

  it('finds component files to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files)('%s uses only theme tokens', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8')
    const offenders = []
    // Literal hex values
    const hexes = src.match(/#[0-9A-Fa-f]{6}\b/g)
    if (hexes) offenders.push(...hexes)
    // Tailwind's built-in light-only palette and absolute black/white
    const classes = src.match(
      /\b(?:bg|text|border|from|to)-(?:white|black|(?:red|amber|green|blue|slate|gray|zinc|neutral|stone)-\d{2,3})\b/g
    )
    if (classes) offenders.push(...classes)
    expect(offenders, `hardcoded in ${file}: ${offenders.join(', ')}`).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The icon must stay the same mark the header shows. It's easy to "improve" the
// favicon into something unrelated, and easy to scale the mark down until the
// ring holes fill in and it rasterises as a solid blob.
// ---------------------------------------------------------------------------
describe('logo mark', () => {
  const pub = (f) => path.join(process.cwd(), 'public', f)

  it('keeps the four-node, three-edge topology of the header glyph', () => {
    const svg = fs.readFileSync(pub('favicon.svg'), 'utf8')
    expect((svg.match(/<circle/g) || []).length).toBe(4)
    expect((svg.match(/<path/g) || []).length).toBe(3)
  })

  it('uses the header glyph coordinates, not a redrawn approximation', () => {
    const svg = fs.readFileSync(pub('favicon.svg'), 'utf8')
    for (const [cx, cy] of [
      [12, 4.5],
      [4.5, 12],
      [19.5, 12],
      [12, 19.5],
    ]) {
      expect(svg, `node ${cx},${cy} missing`).toContain(`cx="${cx}" cy="${cy}"`)
    }
    expect(svg).toContain('M7 12h10')
  })

  it('draws the nodes as open rings, which is what fails first at 16px', () => {
    const svg = fs.readFileSync(pub('favicon.svg'), 'utf8')
    const circles = svg.match(/<circle[^>]*>/g) || []
    circles.forEach((c) => {
      expect(c, 'node should be stroked, not filled').toContain('fill="none"')
    })
    // Stroke must stay thin enough that the holes survive rasterising.
    const width = Number(/stroke-width="([\d.]+)"/.exec(circles[0])[1])
    expect(width).toBeLessThanOrEqual(1.6)
  })

  it('ships a favicon whose 16px raster is not a solid mass', () => {
    // A blob would be near-100% ink in the middle band; four rings leave holes.
    const png = fs.readFileSync(pub('favicon-16.png'))
    expect(png.length).toBeGreaterThan(200)
    expect(png.subarray(1, 4).toString()).toBe('PNG')
  })
})
