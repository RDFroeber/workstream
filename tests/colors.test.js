import { describe, it, expect } from 'vitest'
import {
  PALETTE,
  FAMILIES,
  nextLineColor,
  colorName,
  LINE_COLORS,
  needsOutline,
} from '../src/lib/colors'
import { hex2lab, deltaE, worstCaseDelta, contrast, VISION_TYPES, simLab } from './colorScience'

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

describe('palette integrity', () => {
  it('offers substantially more than the original ten', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(24)
  })

  it('has no duplicate hexes, ids or names', () => {
    expect(new Set(PALETTE.map((c) => c.hex)).size).toBe(PALETTE.length)
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(PALETTE.length)
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(PALETTE.length)
  })

  it('uses only declared families', () => {
    PALETTE.forEach((c) => expect(FAMILIES).toContain(c.family))
  })

  it('every color stays visible against the white panel', () => {
    // The 12px progress marker sits on white; below ~3:1 it disappears.
    PALETTE.filter((c) => !c.lowContrast).forEach((c) =>
      expect(contrast(c.hex, '#FFFFFF'), c.name).toBeGreaterThanOrEqual(3.0)
    )
  })

  it('allows the contrast floor to be broken only where it is flagged', () => {
    // Amber is the one true yellow, and true yellow cannot clear 3:1 on white.
    // The exception is allowed but has to be declared, and stay rare.
    const exceptions = PALETTE.filter((c) => c.lowContrast)
    expect(exceptions.length).toBeLessThanOrEqual(1)
    exceptions.forEach((c) => {
      // Still has to be visible enough to be worth having.
      expect(contrast(c.hex, '#FFFFFF'), c.name).toBeGreaterThanOrEqual(2.4)
    })
  })

  it('gives flagged colors an outline so the UI can compensate', () => {
    PALETTE.forEach((c) => expect(needsOutline(c.hex)).toBe(Boolean(c.lowContrast)))
    expect(needsOutline('#123456')).toBe(false)
  })

  it('holds every color to a similar lightness so none dominates the dashboard', () => {
    const Ls = PALETTE.filter((c) => !c.lowContrast).map((c) => hex2lab(c.hex)[0])
    expect(Math.min(...Ls)).toBeGreaterThan(25)
    expect(Math.max(...Ls)).toBeLessThan(65)
    // The flagged exception is allowed to be lighter, but not unboundedly so.
    PALETTE.filter((c) => c.lowContrast).forEach((c) =>
      expect(hex2lab(c.hex)[0], c.name).toBeLessThan(70)
    )
  })

  it('keeps every pair comfortably above the just-noticeable threshold', () => {
    // JND is around ΔE 2.3. Same-family shades (Green/Seafoam) sit closest by
    // design — they're meant to read as related, just not identical.
    const { worst, pair } = worstPair(PALETTE.map((c) => c.hex), normalDelta)
    expect(worst, `closest pair: ${pair}`).toBeGreaterThan(5)
  })

  it('keeps colors from different families clearly apart', () => {
    let worst = Infinity
    let pair = null
    for (let i = 0; i < PALETTE.length; i++) {
      for (let j = i + 1; j < PALETTE.length; j++) {
        if (PALETTE[i].family === PALETTE[j].family) continue
        const d = normalDelta(PALETTE[i].hex, PALETTE[j].hex)
        if (d < worst) {
          worst = d
          pair = [PALETTE[i].name, PALETTE[j].name]
        }
      }
    }
    expect(worst, `closest cross-family pair: ${pair?.join(' / ')}`).toBeGreaterThan(6)
  })
})

describe('colorblind-safe subset', () => {
  const safe = PALETTE.filter((c) => c.safe)

  it('exists and is a usable size', () => {
    expect(safe.length).toBe(8)
  })

  it('spans many hue families rather than clustering', () => {
    expect(new Set(safe.map((c) => c.family)).size).toBeGreaterThanOrEqual(6)
  })

  it('stays distinguishable under all three dichromacies', () => {
    // This is the actual promise the "High-contrast set" toggle makes.
    const { worst, pair } = worstPair(safe.map((c) => c.hex), worstCaseDelta)
    expect(worst, `closest safe pair under simulation: ${pair}`).toBeGreaterThan(10)
  })

  it('each vision type individually keeps them apart', () => {
    for (const type of VISION_TYPES) {
      const { worst } = worstPair(safe.map((c) => c.hex), (a, b) =>
        deltaE(simLab(a, type), simLab(b, type))
      )
      expect(worst, `failed under ${type}`).toBeGreaterThan(10)
    }
  })

  it('is more robust than an arbitrary same-size slice of the palette', () => {
    const arbitrary = PALETTE.slice(0, 8).map((c) => c.hex)
    const safeWorst = worstPair(safe.map((c) => c.hex), worstCaseDelta).worst
    expect(safeWorst).toBeGreaterThan(worstPair(arbitrary, worstCaseDelta).worst)
  })
})

describe('nextLineColor', () => {
  it('never repeats a color while unused ones remain', () => {
    const used = []
    for (let i = 0; i < PALETTE.length; i++) {
      const c = nextLineColor(used)
      expect(used).not.toContain(c)
      used.push(c)
    }
    expect(used.length).toBe(PALETTE.length)
  })

  it('keeps auto-assigned lines apart even for colorblind users', () => {
    // The realistic case: someone with 7-8 workstreams who never picked a color.
    const used = []
    for (let i = 0; i < 8; i++) used.push(nextLineColor(used))
    const { worst, pair } = worstPair(used, worstCaseDelta)
    expect(worst, `closest auto-assigned pair: ${pair}`).toBeGreaterThan(10)
  })

  it('beats naive sequential assignment at 8 lines', () => {
    const auto = []
    for (let i = 0; i < 8; i++) auto.push(nextLineColor(auto))
    const naive = PALETTE.slice(0, 8).map((c) => c.hex)
    expect(worstPair(auto, worstCaseDelta).worst).toBeGreaterThan(
      worstPair(naive, worstCaseDelta).worst
    )
  })

  it('does not hand a drab neutral to the first few lines', () => {
    const neutrals = PALETTE.filter((c) => c.family === 'Neutral').map((c) => c.hex)
    const used = []
    for (let i = 0; i < 5; i++) used.push(nextLineColor(used))
    used.forEach((hex) => expect(neutrals).not.toContain(hex))
  })

  it('still returns a valid color once every one is taken', () => {
    const c = nextLineColor(LINE_COLORS)
    expect(c).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe('colorName', () => {
  it('names a known color', () => {
    expect(colorName('#2C7BE5')).toBe('Sky')
  })
  it('falls back for a color saved before the palette changed', () => {
    expect(colorName('#123456')).toBe('Custom')
  })
})
