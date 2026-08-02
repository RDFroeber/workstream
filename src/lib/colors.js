// A transit-map style palette: distinct, saturated, identifiable at a glance.
export const LINE_COLORS = [
  '#2C7BE5', // blue
  '#C0392B', // red
  '#1E8A6E', // green
  '#E08E0B', // amber
  '#6C4FA0', // purple
  '#C2478A', // magenta
  '#178A94', // teal
  '#5C6B2E', // olive
  '#A34E1F', // rust
  '#3E5C9A', // indigo
]

export function nextLineColor(existingColors = []) {
  const unused = LINE_COLORS.find((c) => !existingColors.includes(c))
  return unused || LINE_COLORS[existingColors.length % LINE_COLORS.length]
}
