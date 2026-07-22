import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // Dev-only: `npm run dev` serves the React app with HMR (instant reload on
    // save), but has no PHP/MySQL behind it. Forward the backend endpoints to the
    // Docker container (docker compose up -d, published on :8080) so /sync.php,
    // /upload.php and /api/*.php work exactly like in production. Has NO effect on
    // `vite build` / the Docker image — this block only configures the dev server.
    proxy: {
      "/sync.php": "http://localhost:8080",
      "/upload.php": "http://localhost:8080",
      "/api": "http://localhost:8080",
    },
  },
})
