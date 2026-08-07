import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../lib/theme'

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/** Three-way switch: explicit light/dark, or follow the OS. */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-hairline p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              active ? 'bg-ink text-panel' : 'text-faint hover:text-muted'
            }`}
          >
            <Icon size={14} strokeWidth={2.2} />
          </button>
        )
      })}
    </div>
  )
}
