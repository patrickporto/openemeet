import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import './styles/global.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
