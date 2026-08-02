import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './lib/theme'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Keeps the shell available with no network. `onNeedRefresh` deliberately just
// updates on the next load rather than interrupting — this is a tracker, not
// something worth a modal mid-task.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
