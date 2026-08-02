import { useState } from 'react'
import { Check, Eye } from 'lucide-react'
import { PALETTE, FAMILIES, colorName } from '../lib/colors'
import { useLineColor } from '../lib/theme'

/**
 * Swatch grid for choosing a line color.
 *
 * `usedColors` are hexes already taken by other lines — shown with a ring so
 * you don't accidentally give two workstreams near-identical colors, which is
 * the failure mode that makes the dashboard hard to scan.
 */
export default function ColorPicker({ value, onChange, usedColors = [] }) {
  const [safeOnly, setSafeOnly] = useState(false)
  // Swatches preview the variant for the current theme, so what you pick is
  // what you'll see on the dashboard.
  const lineColor = useLineColor()
  const used = new Set(usedColors.filter((c) => c !== value))
  const colors = safeOnly ? PALETTE.filter((c) => c.safe) : PALETTE

  // A line created before the palette changed may hold a hex that's no longer
  // offered. Surface it as its own swatch rather than showing nothing selected.
  const isLegacy = Boolean(value) && !PALETTE.some((c) => c.hex === value)

  const byFamily = FAMILIES.map((f) => [f, colors.filter((c) => c.family === f)]).filter(
    ([, list]) => list.length > 0
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted">
          Color <span className="text-faint">· {colorName(value)}</span>
        </label>
        <button
          type="button"
          onClick={() => setSafeOnly((v) => !v)}
          aria-pressed={safeOnly}
          title="Show only colors that stay distinguishable with color vision deficiency"
          className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-1 border transition-colors ${
            safeOnly
              ? 'border-accent bg-accentSoft text-accent'
              : 'border-hairlineStrong text-muted hover:text-ink'
          }`}
        >
          <Eye size={11} /> High-contrast set
        </button>
      </div>

      <div className="border border-hairlineStrong rounded-lg p-2.5 bg-panel">
        <div className="space-y-2">
          {isLegacy && !safeOnly && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-faint w-12 shrink-0">
                Current
              </span>
              <button
                type="button"
                onClick={() => onChange(value)}
                aria-label="Keep the current color"
                aria-pressed
                title="This line's existing color"
                className="relative w-7 h-7 rounded-full flex items-center justify-center"
                style={{
                  background: lineColor(value),
                  outline: `2px solid ${lineColor(value)}`,
                  outlineOffset: 2,
                }}
              >
                <Check size={14} className="text-panel" strokeWidth={3} />
              </button>
            </div>
          )}
          {byFamily.map(([family, list]) => (
            <div key={family} className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-faint w-12 shrink-0">
                {family}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {list.map((c) => {
                  const selected = value === c.hex
                  const isUsed = used.has(c.hex)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => onChange(c.hex)}
                      title={isUsed ? `${c.name} — already used by another line` : c.name}
                      aria-label={`${c.name}${isUsed ? ', already in use' : ''}`}
                      aria-pressed={selected}
                      className="relative w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                      style={{
                        background: lineColor(c.hex),
                        outline: selected ? `2px solid ${lineColor(c.hex)}` : 'none',
                        outlineOffset: 2,
                      }}
                    >
                      {selected && <Check size={14} className="text-panel" strokeWidth={3} />}
                      {!selected && isUsed && (
                        <span className="absolute inset-0 rounded-full border-2 border-panel" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {used.size > 0 && !safeOnly && (
          <p className="text-[11px] text-faint mt-2.5 pt-2 border-t border-hairline">
            Colors with a white ring are already used by another line.
          </p>
        )}
        {safeOnly && (
          <p className="text-[11px] text-muted mt-2.5 pt-2 border-t border-hairline">
            These eight stay tellable apart with red-green or blue-yellow color blindness.
            Past eight, no palette can guarantee that.
          </p>
        )}
      </div>
    </div>
  )
}
