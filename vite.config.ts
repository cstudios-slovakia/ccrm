import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// The PostCSS chain imports scripts/postcss-dark-palette.mjs once, when the dev
// server boots. Vite restarts itself when postcss.config.js changes but knows
// nothing about the modules that file imports, so editing the dark-mode plugin
// changed nothing on screen: index.css does recompile on save, but through the
// plugin instance already sitting in memory. The symptom is maddening — the
// source is right, the compiled CSS is right, the browser is served last hour's
// output — so watch the file ourselves and restart the server on a change.
const watchDarkPalettePlugin = (): Plugin => ({
  name: 'ccrm:watch-postcss-dark-palette',
  configureServer(server: ViteDevServer) {
    const plugin = path.resolve(process.cwd(), 'scripts/postcss-dark-palette.mjs')
    server.watcher.add(plugin)
    server.watcher.on('change', (changed) => {
      if (path.resolve(changed) === plugin) void server.restart()
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // CCRM_DEV_BACKEND_PORT lets a machine where 8085 is already taken by another
  // project override the Docker backend port locally via a .env file (gitignored)
  // without touching this committed file.
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = `http://localhost:${env.CCRM_DEV_BACKEND_PORT || '8085'}`

  return {
    plugins: [react(), watchDarkPalettePlugin()],
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
        // and reports into the project root while a dev server is running, so
        // every artefact it saved was waking a watcher for nothing.
        ignored: [
          '**/dist/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/presentation-screenshots/**',
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
