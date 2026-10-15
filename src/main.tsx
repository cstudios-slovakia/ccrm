// MUST stay the first import: it replaces localStorage/sessionStorage with an
// in-memory stand-in when the browser forbids them (iOS Safari with "Block All
// Cookies" throws a SecurityError on access), and module evaluation order is
// what guarantees it runs before anything else touches storage.
import './utils/safeStorage'
// Second: listens for `beforeinstallprompt`, which can fire before React renders.
import './utils/pwaInstall'
import { normalizeLaunchUrl } from './utils/launchIntent'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { Agentation } from 'agentation'

// A page opened by the installed app's share target arrives as `/?ccrm_share_*=…`;
// turn it into `#tasks?newTask=…` before the router reads the address.
normalizeLaunchUrl()

// Dev-only gallery of the layout primitives: `/#ui-gallery`. Tree-shaken from production builds.
const UiGallery = import.meta.env.DEV && window.location.hash.startsWith('#ui-gallery')
  ? lazy(() => import('./dev/UiGallery.tsx'))
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {UiGallery ? (
        <Suspense fallback={null}>
          <UiGallery />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
    {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
  </StrictMode>,
)
