import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      // main.jsx is bootstrap wiring, supabaseClient is a thin env-var shim,
      // and neither can run meaningfully outside a browser.
      exclude: ['src/main.jsx', 'src/lib/supabaseClient.js'],
      reporter: ['text', 'json-summary'],
    },
  },
})
