import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // CCRM_DEV_BACKEND_PORT lets a machine where 8085 is already taken by another
  // project override the Docker backend port locally via a .env file (gitignored)
  // without touching this committed file.
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = `http://localhost:${env.CCRM_DEV_BACKEND_PORT || '8085'}`

  return {
    plugins: [react()],
    base: "./",
    server: {
      // CCRM_DEV_PORT pins this checkout to one fixed port so multiple worktrees
      // (e.g. two branches checked out side by side) never drift onto each other's
      // port when one dev server restarts. strictPort makes vite fail loudly on a
      // clash instead of silently falling back to another port, which is what made
      // two browser tabs quietly end up pointing at the same server before.
      port: Number(env.CCRM_DEV_PORT) || 5173,
      strictPort: true,
      watch: {
        // Generated output, none of which the dev server should ever reload for.
        // `test-results/` matters most: the QA audit writes screenshots, traces
        // and reports into the project root while a dev server is running, and
        // in this checkout the suite reuses the very server you develop against
        // (`reuseExistingServer`), so every artefact it saved was waking that
        // server's watcher for nothing.
        ignored: [
          '**/dist/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/uploads/**',
          '**/vendor/**',
        ],
      },
      // Dev-only: `npm run dev` serves the React app with HMR (instant reload on
      // save), but has no PHP/MySQL behind it. Forward the backend endpoints to the
      // Docker container (docker compose up -d, published on :8085 by default) so
      // /sync.php, /upload.php and /api/*.php work exactly like in production. Has
      // NO effect on `vite build` / the Docker image — this block only configures
      // the dev server.
      proxy: {
        "/sync.php": backendTarget,
        "/upload.php": backendTarget,
        "/api": backendTarget,
      },
    },
  }
})
