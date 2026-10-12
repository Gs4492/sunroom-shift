
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sunroom-shift/sw.js')
      .then((registration) => {
        console.log('Service worker registered:', registration.scope)
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error)
      })
  })
}
