import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // CCRM_DEV_BACKEND_PORT lets a machine where 8080 is already taken by another
  // project override the Docker backend port locally via a .env file (gitignored)
  // without touching this committed file.
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = `http://localhost:${env.CCRM_DEV_BACKEND_PORT || '8080'}`

  return {
    plugins: [react()],
    base: "./",
    server: {
      // Dev-only: `npm run dev` serves the React app with HMR (instant reload on
      // save), but has no PHP/MySQL behind it. Forward the backend endpoints to the
      // Docker container (docker compose up -d, published on :8080 by default) so
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
