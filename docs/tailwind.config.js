/** @type {import('tailwindcss').Config} */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: withAlpha('--paper'),
        panel: withAlpha('--panel'),
        ink: withAlpha('--ink'),
        muted: withAlpha('--muted'),
        faint: withAlpha('--faint'),
        hairline: withAlpha('--hairline'),
        hairlineStrong: withAlpha('--hairline-strong'),
        accent: withAlpha('--accent'),
        accentHover: withAlpha('--accent-hover'),
        accentSoft: withAlpha('--accent-soft'),
        danger: withAlpha('--danger'),
        dangerSoft: withAlpha('--danger-soft'),
        dangerBorder: withAlpha('--danger-border'),
        success: withAlpha('--success'),
        warn: withAlpha('--warn'),
        warnSoft: withAlpha('--warn-soft'),
        warnBorder: withAlpha('--warn-border'),
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '10px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
      },
    },
  },
  plugins: [],
}
