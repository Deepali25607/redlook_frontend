import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Bootstrap i18next before App so the very first render has translations
// available. The module also wires `<html lang="…">` to track changes.
import './i18n'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
