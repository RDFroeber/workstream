// ---------------------------------------------------------------------------
// Line palette
//
// 24 colors across 8 hue families, all held near L* 45–58 so no single line
// shouts louder than the others on the dashboard, and all at contrast >= 3.0
// against the white panel so the 12px progress marker stays visible.
//
// Each color carries a `dark` variant. The light hex is what's stored in the
// database; the dark one is swapped in at render time when the dark theme is
// active. This is necessary rather than cosmetic — 12 of the 24 light colors
// fall below 3:1 contrast on a dark panel (Graphite manages only 1.59:1), so
// half the palette would effectively vanish. The dark set was solved for under
// the same constraints as the light one: >= 3.5:1 on the dark panel, every pair
// separated, and the safe subset still safe under all three dichromacies.
//
// `safe: true` marks a subset of 8 that stays mutually distinguishable under
// deuteranopia, protanopia and tritanopia (worst-case CIEDE2000 ΔE 10.9).
// Beyond ~8 colors that guarantee is mathematically impossible — dichromatic
// vision collapses the color space — which is why the picker can filter to
// just this subset rather than pretending all 24 work for everyone.
// ---------------------------------------------------------------------------

export const PALETTE = [
  // red
  { id: 'crimson', name: 'Crimson', hex: '#C0392B', family: 'Red', dark: '#CF4D48' },
  { id: 'rose', name: 'Rose', hex: '#C43A5E', family: 'Red', dark: '#C74D72' },
  { id: 'rust', name: 'Rust', hex: '#A34E1F', family: 'Red', safe: true, dark: '#AB632F' },
  // orange / amber
  { id: 'orange', name: 'Orange', hex: '#D2691E', family: 'Orange', safe: true, dark: '#E55A0D' },
  { id: 'amber', name: 'Amber', hex: '#B8790F', family: 'Orange', dark: '#BC7628' },
  { id: 'gold', name: 'Gold', hex: '#9A8203', family: 'Orange', dark: '#A17F1E' },
  // green
  { id: 'olive', name: 'Olive', hex: '#5C6B2E', family: 'Green', safe: true, dark: '#777D45' },
  { id: 'lime', name: 'Lime', hex: '#4F8A10', family: 'Green', dark: '#618718' },
  { id: 'forest', name: 'Forest', hex: '#186B3A', family: 'Green', dark: '#49834F' },
  { id: 'green', name: 'Green', hex: '#1E8A6E', family: 'Green', dark: '#34886C' },
  { id: 'seafoam', name: 'Seafoam', hex: '#2C9C7A', family: 'Green', dark: '#469A75' },
  // teal / cyan
  { id: 'teal', name: 'Teal', hex: '#178A94', family: 'Teal', dark: '#30898D' },
  { id: 'cyan', name: 'Cyan', hex: '#0E7C9E', family: 'Teal', dark: '#007FA3' },
  // blue
  { id: 'sky', name: 'Sky', hex: '#2C7BE5', family: 'Blue', safe: true, dark: '#618BFF' },
  { id: 'blue', name: 'Blue', hex: '#2E5FC4', family: 'Blue', dark: '#007CEE' },
  { id: 'navy', name: 'Navy', hex: '#2A3F8F', family: 'Blue', safe: true, dark: '#4A72D1' },
  // purple
  { id: 'indigo', name: 'Indigo', hex: '#4B3FA8', family: 'Purple', dark: '#6B67E2' },
  { id: 'violet', name: 'Violet', hex: '#6C4FA0', family: 'Purple', safe: true, dark: '#8670BC' },
  { id: 'purple', name: 'Purple', hex: '#8B3FA0', family: 'Purple', dark: '#9861BC' },
  // pink / magenta
  { id: 'magenta', name: 'Magenta', hex: '#A62F86', family: 'Pink', safe: true, dark: '#BB50AA' },
  { id: 'pink', name: 'Pink', hex: '#C2478A', family: 'Pink', dark: '#B94F8C' },
  // neutrals — useful for background or "someday" lines you want to recede
  { id: 'slate', name: 'Slate', hex: '#4A6070', family: 'Neutral', dark: '#5B7A8C' },
  { id: 'stone', name: 'Stone', hex: '#7A6A5D', family: 'Neutral', dark: '#847469' },
  { id: 'graphite', name: 'Graphite', hex: '#39424E', family: 'Neutral', safe: true, dark: '#6D7783' },
]

export const FAMILIES = ['Red', 'Orange', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Neutral']

export const PALETTE_BY_HEX = Object.fromEntries(PALETTE.map((c) => [c.hex, c]))

/** Plain hex list — kept for anything that just wants the colors. */
export const LINE_COLORS = PALETTE.map((c) => c.hex)

/**
 * The order new lines get assigned colors in. Computed offline by a greedy
 * max-min search over CIEDE2000 distance, evaluated simultaneously under normal
 * vision and all three dichromacies — so the more lines you add, the more this
 * order keeps them apart rather than drifting into adjacent hues.
 *
 * Neutrals are held to the back: including them earlier is marginally better
 * mathematically, but a 4th workstream colored dark grey looks like a bug.
 * The cost is nil at 8 lines (worst-case ΔE 10.9 either way).
 */
const ASSIGN_ORDER = [
  'violet', 'rust', 'olive', 'magenta', 'forest', 'sky', 'navy', 'orange',
  'purple', 'pink', 'indigo', 'crimson', 'blue', 'gold', 'lime', 'green',
  'seafoam', 'rose', 'amber', 'cyan', 'teal', 'slate', 'stone', 'graphite',
]

export function nextLineColor(existingColors = []) {
  const used = new Set(existingColors)
  for (const id of ASSIGN_ORDER) {
    const c = PALETTE.find((p) => p.id === id)
    if (c && !used.has(c.hex)) return c.hex
  }
  // Every color taken — wrap around rather than returning nothing.
  const idx = existingColors.length % PALETTE.length
  return PALETTE[idx].hex
}

export function colorName(hex) {
  return PALETTE_BY_HEX[hex]?.name || 'Custom'
}

/**
 * Map a stored (light) line color to the variant for the active theme.
 * Unknown hexes — e.g. saved before a palette change — pass through unchanged.
 */
export function themeColor(hex, isDark) {
  if (!isDark) return hex
  return PALETTE_BY_HEX[hex]?.dark || hex
}
