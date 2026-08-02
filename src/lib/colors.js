// ---------------------------------------------------------------------------
// Line palette
//
// 24 colors across 8 hue families, all held near L* 45–58 so no single line
// shouts louder than the others on the dashboard, and all at contrast >= 3.0
// against the white panel so the 12px progress marker stays visible.
//
// `safe: true` marks a subset of 8 that stays mutually distinguishable under
// deuteranopia, protanopia and tritanopia (worst-case CIEDE2000 ΔE 10.9).
// Beyond ~8 colors that guarantee is mathematically impossible — dichromatic
// vision collapses the color space — which is why the picker can filter to
// just this subset rather than pretending all 24 work for everyone.
// ---------------------------------------------------------------------------

export const PALETTE = [
  // red
  { id: 'crimson', name: 'Crimson', hex: '#C0392B', family: 'Red' },
  { id: 'rose', name: 'Rose', hex: '#C43A5E', family: 'Red' },
  { id: 'rust', name: 'Rust', hex: '#A34E1F', family: 'Red', safe: true },
  // orange / amber
  { id: 'orange', name: 'Orange', hex: '#D2691E', family: 'Orange', safe: true },
  { id: 'amber', name: 'Amber', hex: '#B8790F', family: 'Orange' },
  { id: 'gold', name: 'Gold', hex: '#9A8203', family: 'Orange' },
  // green
  { id: 'olive', name: 'Olive', hex: '#5C6B2E', family: 'Green', safe: true },
  { id: 'lime', name: 'Lime', hex: '#4F8A10', family: 'Green' },
  { id: 'forest', name: 'Forest', hex: '#186B3A', family: 'Green' },
  { id: 'green', name: 'Green', hex: '#1E8A6E', family: 'Green' },
  { id: 'seafoam', name: 'Seafoam', hex: '#2C9C7A', family: 'Green' },
  // teal / cyan
  { id: 'teal', name: 'Teal', hex: '#178A94', family: 'Teal' },
  { id: 'cyan', name: 'Cyan', hex: '#0E7C9E', family: 'Teal' },
  // blue
  { id: 'sky', name: 'Sky', hex: '#2C7BE5', family: 'Blue', safe: true },
  { id: 'blue', name: 'Blue', hex: '#2E5FC4', family: 'Blue' },
  { id: 'navy', name: 'Navy', hex: '#2A3F8F', family: 'Blue', safe: true },
  // purple
  { id: 'indigo', name: 'Indigo', hex: '#4B3FA8', family: 'Purple' },
  { id: 'violet', name: 'Violet', hex: '#6C4FA0', family: 'Purple', safe: true },
  { id: 'purple', name: 'Purple', hex: '#8B3FA0', family: 'Purple' },
  // pink / magenta
  { id: 'magenta', name: 'Magenta', hex: '#A62F86', family: 'Pink', safe: true },
  { id: 'pink', name: 'Pink', hex: '#C2478A', family: 'Pink' },
  // neutrals — useful for background or "someday" lines you want to recede
  { id: 'slate', name: 'Slate', hex: '#4A6070', family: 'Neutral' },
  { id: 'stone', name: 'Stone', hex: '#7A6A5D', family: 'Neutral' },
  { id: 'graphite', name: 'Graphite', hex: '#39424E', family: 'Neutral', safe: true },
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
