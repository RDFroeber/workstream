import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './lib/theme'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Keeps the shell available with no network, and takes over as soon as a new
// build is available. Paired with registerType: 'autoUpdate' — see the comment
// in vite.config.js for why the default ('prompt') silently pins users to
// whichever build they first loaded.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
