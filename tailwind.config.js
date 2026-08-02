/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F8FA',
        panel: '#FFFFFF',
        ink: '#1B2430',
        muted: '#6B7685',
        faint: '#9AA3B0',
        hairline: '#E2E5EA',
        hairlineStrong: '#CBD1D9',
        accent: '#22404F',
        accentSoft: '#E8EEF0',
        danger: '#C0392B',
        warn: '#B8790F',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,36,48,0.04), 0 1px 1px rgba(27,36,48,0.03)',
        raised: '0 4px 16px rgba(27,36,48,0.10)',
      },
    },
  },
  plugins: [],
}
