# CCRM as an installed app (PWA)

CCRM installs from Chrome (and Edge) in one click — no store, no admin rights, no
developer mode. It replaces the former `chrome-extension/`.

## Where things live

| Piece | File |
|---|---|
| Manifest: `id`, `scope`, `shortcuts`, `share_target`, `launch_handler`, screenshots | `public/manifest.json` |
| Service worker: push, notification click, pass-through `fetch` | `public/sw.js` |
| Install state, `beforeinstallprompt` capture, `usePwaInstall()` | `src/utils/pwaInstall.ts` (pure rules: `pwaInstallLogic.ts`) |
| Settings → Profile → "Install CCRM app" card | `src/components/PwaInstallCard.tsx` |
| Automatic install offer (dismissible, 30-day re-offer) | `src/components/PwaInstallBanner.tsx` |
| Deep links `#tasks?newTask=` / `#tasks?voice=1`, share-target rewrite, bookmarklet | `src/utils/launchIntent.ts` |
| Task count on the app icon (Badging API) | `src/utils/appBadge.ts`, `src/utils/taskBadge.ts` |
| Mini window (Document Picture-in-Picture, popup fallback) | `src/utils/popOut.ts` |

## Behaviour worth knowing

- **`beforeinstallprompt` is captured at module load** (`main.tsx` imports
  `pwaInstall` second, after `safeStorage`). It can fire before React renders.
- **The service worker has a pass-through `fetch` handler on purpose.** Chrome only
  fires `beforeinstallprompt` (the in-app Install button) for a worker that has
  one. The handler never calls `respondWith()` and nothing is cached, so the
  network-only rule is unchanged. Do not add caching to it.
- **Install button vs. menu.** The button exists only while the browser is
  offering the prompt (single use). Otherwise the card names the browser-menu
  route. There is never a button that does nothing.
- **Automatic offer** (`PwaInstallBanner`): signed-in user, `canInstall`, not
  installed, not in the mini window, not in a `?qa=` run, not dismissed in the
  last 30 days. The dismissal is per user (`ccrm_pwa_install_dismissed:<email>`).
  It never gates anything.
- **Installed on this device** is remembered in `ccrm_pwa_installed` so a normal
  browser tab can still say "Installed"; a fresh `beforeinstallprompt` clears it
  (that is how an uninstall shows up).
- **Share target.** A browser can only put shared data in the query string, so the
  manifest maps `title` / `text` / `url` to `ccrm_share_title` / `ccrm_share_text` /
  `ccrm_share_url`. `normalizeLaunchUrl()` (called in `main.tsx`) rewrites
  `/?ccrm_share_…` to `/#tasks?newTask=…` and drops the query. The result is a
  single-line task (newlines collapsed, 500 characters, a link is never cut).
- **Deep links** are read by `TaskDashboardView` on mount and on `hashchange`, then
  removed from the address (`consumeLaunchIntent`). A link opened while signed out
  survives the login: `onLoginSuccess` keeps the hash when it carries one.
  A `newTask` that arrives while the form is open is added as another line.
- **Voice link.** Browsers only show the microphone prompt for a user gesture, so
  `#tasks?voice=1` starts recording at once only when the microphone is already
  allowed; otherwise it highlights and focuses the record button ("armed").
- **Mini window** loads `#tasks?embed=tasks` (the compact tasks view) in a
  same-origin frame inside a Document Picture-in-Picture window (always on top),
  or in a small popup where PiP is unavailable (not always on top). Sign-in is
  per window (`sessionStorage`), so the PiP frame is seeded with the opener's
  user; `window.open` popups inherit it from the browser.
- **Badge** = tasks on the user's own board (assigned to or created by them) that
  are Missed or due Today, refreshed every minute. Not set in the mini window.

## Desktop support

| Feature | Windows | macOS | Linux | ChromeOS |
|---|---|---|---|---|
| Install, shortcuts, notifications | yes | yes | yes | yes |
| Task-count badge | yes | yes | not reliable — feature-detected, the card says so | yes |
| Mini window — Picture-in-Picture (always on top) | Chrome / Edge 116+ | Chrome / Edge 116+ | Chrome / Edge 116+ | Chrome 116+ |
| Share a page into CCRM from the browser's Share command | yes | no | no | yes |
| "Send to CCRM" bookmarklet (selected text) | yes | yes | yes | yes |

The support columns are Chrome's documented behaviour, not something this repo
can test; check the manual list below on each OS before relying on a cell. Chrome
does not register installed web apps as share targets on macOS and Linux, so the
Settings card offers the bookmarklet there. The card words this honestly
and does not promise a right-click menu.

Not used: `display_override: ["window-controls-overlay"]` — it would put the page
under the title bar and the header does not reserve the `titlebar-area` space.
No offline fallback — it would need a caching `fetch` handler, which this worker
deliberately avoids.

## Tests

- Unit: `pwaInstallLogic.test.ts`, `launchIntent.test.ts` (also runs the bookmarklet
  in a VM), `taskBadge.test.ts`.
- QA: `tests/e2e/pwaInstall.spec.ts` simulates the browser's side
  (`beforeinstallprompt`, `appinstalled`, `documentPictureInPicture`,
  `setAppBadge`, microphone permission). A real install cannot be driven from
  Playwright; see the manual checklist in the release notes for that.

## Manual check (per OS, in Chrome)

1. Open CCRM over HTTPS, sign in. Settings → Profile → "Install CCRM app" shows an
   **Install** button (or the banner appears at the top). Install.
2. The app opens in its own window; the card says **Installed**.
3. Right-click the app icon (taskbar / dock / Start): **My tasks**, **New voice task**,
   **New task** open `#tasks`, the recorder (armed, or recording if the microphone is
   already allowed) and a blank create form.
4. Windows / ChromeOS: Chrome menu → Cast, save and share → Share… → CCRM creates a
   task from the page title and link. macOS / Linux: drag **Send to CCRM** to the
   bookmarks bar, select text on any page, click it.
5. Tasks page → **Pop out**: a small window stays above other apps.
6. Windows / macOS: the icon shows the Missed + Today count; complete tasks and it
   drops, at 0 it clears.
