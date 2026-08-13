// MUST stay the first import: it replaces localStorage/sessionStorage with an
// in-memory stand-in when the browser forbids them (iOS Safari with "Block All
// Cookies" throws a SecurityError on access), and module evaluation order is
// what guarantees it runs before anything else touches storage.
import './utils/safeStorage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
