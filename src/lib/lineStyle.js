import { needsOutline } from './colors'

/**
 * Style helper for anything painted in a line's colour.
 *
 * Amber is a deliberate low-contrast exception — a true yellow can't clear 3:1
 * against white — so wherever it's used as a fill it gets a faint darker
 * outline to hold its edge. Every other colour is left alone, so the outline
 * never becomes ambient noise across the whole palette.
 */
export function lineFill(hex, storedHex = hex) {
  const style = { background: hex }
  if (needsOutline(storedHex)) {
    style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.28)'
  }
  return style
}

export function lineBorderColor(hex, storedHex = hex) {
  return needsOutline(storedHex) ? 'rgba(0,0,0,0.28)' : hex
}
