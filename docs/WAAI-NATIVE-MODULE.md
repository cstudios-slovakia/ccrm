# WhatsApp as a native CCRM module — analysis and implementation plan

> **Status:** plan written 2026-10-29; Phases 0 and 1 done (see §6, §9). Phases are run one at a time
> (Sonnet 5.5, high). Update the status table in §6 and the "As built" notes at the end of
> every phase.
> **Repos:** CCRM = this worktree (`Other_web_apps/ccrm/ccrm-waai`, branch `1.13-nectarine`).
> WAAI = `01_My_web_apps/waai-ccrm` (branch `feat/ccrm-integration`). Work for this plan
> goes on a **new WAAI worktree and branch**, see Phase 0.
> **Read first:** `docs/WAAI-INTEGRATION.md` (the integration that exists: API, links, tasks,
> timeline, SSO, the iframe module). This document replaces only its §4.7 "embedding" part.
> The machine API (`/api/v1`), links, tasks and timeline do not change.

---

## 0. The answer in one page

**Today** the CCRM WhatsApp module (`src/components/WhatsAppView.tsx`) loads the whole WAAI
web app in an `<iframe>` from `https://wa.<domain>` and signs it in over `postMessage`. WAAI
draws everything with its own design system ("Aurora": glass cards, purple hue, Plus Jakarta
Sans, hand-written pixel font sizes), so the module looks like a different product. The iframe
also has hard limits: WAAI's dialogs cannot cover the CRM's sidebar, CCRM's View size and toasts
do not reach inside, and the frame needs its own DNS name.

**Target:** the WhatsApp module is ordinary CCRM React code. It uses CCRM's page skeleton,
layout primitives, View size type tokens, colours, dialogs and toasts. It has the same screens
and features as WAAI (Chats, Digest, Tasks, Ask, Settings, linking a WhatsApp account by QR,
voice notes, reactions, AI summaries, task extraction, CRM links, open by phone). WAAI becomes
the module's **backend**: the browser calls a new bearer-authenticated JSON API in WAAI's `web`
app (`/api/ccrm/v1/*`). Standalone WAAI on its own domain stays exactly as it is.

**DNS:** yes, this removes the need for a WAAI DNS record. On the VPS (Scenario S1), CCRM's Caddy
proxies one path on the **CRM's own domain**, `https://crm.<domain>/waai-api/*`, to WAAI's
`web` container over the private Docker network. The browser never talks to a second host. The
`wa.<domain>` record is then needed only for standalone WAAI and can come later. For a CCRM on
shared hosting (Scenario S2), the module can call WAAI's domain directly (CORS).

**Where the code goes:** the new UI is written **in CCRM** (`src/components/whatsapp/`). WAAI
gets **no new UI**, only an API layer (§4.3): its 58 server actions and its server-rendered pages
(chat list, conversation header, settings, tasks, digest) cannot be called from another app.
WAAI's own screens stay as they are.

**Cost (read this before approving):** this is the option `WAAI-INTEGRATION.md` §2 rejected
("rebuild WAAI's UI natively in CCRM"). It now has a reason: the product has to look like one
app. The price is that **the WhatsApp UI exists twice, in two repos**: WAAI's existing Next.js
screens for standalone access and the new React/Vite module in CCRM. The double cost is for
**future features**. If the CCRM module is declared the primary UI and standalone WAAI is allowed
to lag behind, a new feature is built only once, in CCRM (decision N9).
About 14,000 of WAAI's 32,000 web lines are UI to port. Every future WAAI UI feature has to be
built twice, or recorded as "standalone only" in the parity matrix (§7). Business logic is not
duplicated: it stays in WAAI and is shared by both UIs (§4.3).

| | What changes |
|---|---|
| **WAAI** | A module API (`/api/ccrm/v1/*`): token exchange from the existing CCRM SSO token, bearer access tokens, signed media URLs, and one endpoint for each route or server action the UI uses. The logic moves into shared `src/server/*` services, so the standalone routes and the module API run the same code. A small zod-free contract file (`packages/module-api`). After the switch, embed mode is removed. |
| **CCRM** | A native module in `src/components/whatsapp/` (about 25 files), an API client with token handling, a vendored contract, a "Connection" setting (same-domain path or direct URL), a per-install switch between the **Native** and **Embedded** UI during the rollout, then removal of the iframe. Caddy and Vite proxy `/waai-api`. No new DB column (settings go into `integration_clients.settings_json`). |

---

## 1. Findings

### 1.1 WAAI web (`apps/web`, Next.js 16, React 19, Tailwind 3)

- About 32,000 TS/TSX lines. The largest UI files are `components/conversation-view.tsx` (2,819),
  `conversation-list-panel.tsx` (1,306), `tasks-section.tsx` (1,068),
  `settings/ai-settings.tsx` (993), `settings/page.tsx` (915), `digest/digest-view.tsx` (578),
  `settings/crm-settings.tsx` (534), `task-update-composer.tsx` (519),
  `aurora/primitives.tsx` (469), `summary-panel.tsx` (460), `tasks/tasks-client.tsx` (457),
  `message-reactions.tsx` (443), `chat-search-results.tsx` (417). The dictionaries hold about
  830 lines per language (en, sk, hu).
- **Data access is mixed:**
  - 34 REST route handlers under `app/api/**`, all authenticated with `await auth()` (the
    Auth.js cookie). They cover messages, send, reactions, media, audio, avatars, summary,
    task updates, tasks, digest, search, mark-read, load-history, resync and the QR stream.
  - **Server components read Prisma directly:** the chat list (`(chats)/layout.tsx` →
    `loadConversationList`), the conversation header (`c/[conversationId]/page.tsx`), the
    settings page, the tasks page and the digest page.
  - **58 server actions** (`'use server'`): settings (AI keys, prompts, models, cost limit,
    speech, members, invites, account connect/disconnect/resync/delete, password, reset data),
    CRM (bridge direction, ping, directory, default country, pairing, task retry, SSO user
    mapping), CRM links, preferences, linking an account, open by phone. 42 places call
    `router.refresh()` / `revalidatePath`.
- **Live data is polling**, apart from one SSE stream. The conversation polls messages every
  5 s (`POLL_INTERVAL_MS`). The chat list refreshes through `router.refresh()` on an interval.
  The unread count is polled (`unread-provider.tsx`). The QR code and link status stream over
  SSE (`/api/wa/stream`, `EventSource`).
- **Media** (`/api/messages/[id]/media`, avatars, audio) is served by URLs used in
  `<img>`/`<audio>`, authenticated by the cookie. The media route sets **no**
  `Content-Disposition` and no `X-Content-Type-Options`. That is acceptable on WAAI's own origin,
  but it is **an XSS hole once it is served from the CRM's origin**: a contact can send an HTML
  or SVG file (see §4.4).
- Rate limits are keyed by client IP (`lib/rate-limit.ts`, `getClientIp` reads
  `X-Forwarded-For`). Behind a proxy path every user can look like the proxy (see §4.3).
- The existing CCRM SSO pieces are reusable as they are: `lib/ccrm-sso.ts`
  (`verifyCcrmSsoToken`, `consumeSsoJti`, `ccrmOrigin`, `ssoSecrets`) and `users.crm_user_id`.
- Libraries the UI needs that CCRM lacks: `@tanstack/react-virtual` (chat list and message list),
  `react-markdown` + `remark-gfm` (AI summaries and answers). Radix is used only for one Select,
  and CCRM's `CustomSelect` replaces it.

### 1.2 CCRM

- React 19 + Vite 8 + Tailwind 4 + lucide + framer-motion. No zod, no router library: hash routing
  lives in `App.tsx`.
- Page skeleton and primitives in `src/components/layout/` (`Page`, `PageHeader`, `Tabs`,
  `Toolbar`, `Surface`, `SplitLayout`, `EmptyState`, `FormGrid`). Shared UI is in
  `src/components/ui/` (`ConfirmDialog`, `HoldToConfirm`, `CustomSelect`, `UndoToast`,
  `SecretInput`, …). There is `VoiceRecorderCard.tsx`. The closest existing screen to a chat
  client is **`EmailView.tsx`** (PageHeader + a 12-column, fixed-height list/reading-pane grid).
- **View size rules (`docs/VIEW-SIZE.md`, binding):** no hand-written font sizes (role tokens /
  `type-*` recipes only), no pixel widths, workspace breakpoints `ws-*`, one page skeleton. This
  codebase writes **raw palette colours** (`text-slate-500`). Dark mode is built on that
  (`src/index.css` "DARK THEME"), so do **not** introduce semantic colour tokens.
- The module exists: catalog entry `whatsapp` (colour `#16a34a`, green-600, icon
  `MessageCircle`), the permission `whatsapp`, the sidebar badge, the hash routes
  `#whatsapp…`, `App.tsx` keeping the view mounted after the first open (`whatsappHost`), and
  `onOpenRecord` for "open in CRM".
- `public/api/waai_sso.php` mints the 60 s HS256 token. Its GET reports `configured` /
  `embed_url`. `WaaiIntegrationSettings.tsx` holds the connection.
- CSP (`public/.htaccess`): `connect-src 'self' …`, no `media-src` (falls back to `'self'`),
  `img-src 'self' data: blob: https:`, `frame-src 'self' https:` (decision D7, for the iframe).
- Task description footers already written into CCRM tasks link to `#whatsapp/c/<id>`. **That
  hash format must keep working.**
- VPS: `deploy/vps/Caddyfile` fronts the Apache `web` container for `{$CCRM_DOMAIN}`.
  `docker-compose.waai.yml` already puts Caddy and `web` on the `waai_ccrm` network, where WAAI's
  `web` answers as `waai-web:3000`.

---

## 2. Options considered

| Option | Verdict |
|---|---|
| **A. Native CCRM UI on a WAAI module API** | ✅ **Recommended.** The only option that is really "consistent with the rest of the app": CCRM dialogs, toasts, View size, keyboard focus, one scroll container, mobile bottom bar. Same-domain proxy removes the DNS need. Cost: a second UI to maintain (§0). |
| B. Keep the iframe, give WAAI a "CCRM skin" (CSS variables, CCRM fonts and palette; CCRM draws the header and tabs and drives WAAI by `postMessage`) | ⚠️ About 2 phases instead of 8, and one UI codebase. It gets to roughly 90 % "looks like CCRM", but stays a frame: dialogs are confined to the frame and do not dim the sidebar, toasts and View size are separate, there are two scroll contexts, dropdowns are clipped at the frame edge, and every CCRM style change must be mirrored by hand. It **also** works without DNS if WAAI is put under a path. This is the fallback if the cost of A is not acceptable. |
| C. Same as A, but the browser goes through a PHP proxy in CCRM (`api/waai_proxy.php`) instead of Caddy | ❌ Each 5 s message poll and every media byte would hold a PHP worker, plus the QR SSE stream for minutes. That is too costly on shared hosting and pointless on the VPS, where Caddy can proxy. |
| D. Load WAAI's React components into CCRM's page (module federation / web component) | ❌ WAAI's screens are Next server components and server actions. They cannot run outside Next. |

---

## 3. Target architecture

```
 Browser — CCRM SPA, https://crm.<domain>
 ┌──────────────────────────────────────────────────────────────────────┐
 │ #whatsapp/…  src/components/whatsapp/  (native React, CCRM styles)   │
 │   waaiClient: base = "/waai-api" (proxy)  or  "https://wa.<d>/api/ccrm/v1" (direct)
 │   1. GET  api/waai_sso.php      → connection info                    │
 │   2. POST api/waai_sso.php      → 60 s SSO JWT (exists)              │
 │   3. POST <base>/session {token} → access token (memory only, 1 h)   │
 │   4. <base>/…  Authorization: Bearer wam_…   (JSON, polling)         │
 │   5. <img src="<base>/media/…?u=&exp=&sig=">  (signed, no header)    │
 └───────────────┬───────────────────────────────────────┬──────────────┘
                 │ /sync.php, /api/*  (unchanged)          │ /waai-api/*
                 ▼                                         ▼
 ┌────────────── Caddy (CCRM stack, S1) ─────────────────────────────────┐
 │  handle_path /waai-api/*  → rewrite /api/ccrm/v1{path} → waai-web:3000 │
 │  handle                   → web:80 (Apache/PHP CCRM)                    │
 │  {$WAAI_DOMAIN} block     → waai-web:3000  (optional: standalone WAAI)  │
 └───────────────┬───────────────────────────────────────┬────────────────┘
                 ▼                                       ▼  waai_ccrm network
        CCRM PHP/MySQL (passive, as today)      WAAI web (Next.js)
                 ▲                               ├─ /api/ccrm/v1/*  module API (new, bearer)
                 │ /api/v1 (unchanged)           ├─ /api/*, pages   standalone UI (cookie)
                 └────────── ai-worker ◀─────────┴─ src/server/*    shared services (new)
```

Rules:
- CCRM PHP still **never** calls WAAI. The module talks to WAAI from the browser only, as the iframe did.
- `/api/ccrm/v1/*` reads **only** the bearer token. It never reads the Auth.js cookie, so a
  CSRF attack has nothing to ride on. Standalone routes keep cookie auth and are not reachable
  through `/waai-api`.
- One copy of business logic: the standalone route or action and the module endpoint call the
  same service function.

---

## 4. Detailed design

### 4.1 Transport, DNS and configuration

**Two transports**, chosen per install in CCRM Settings → Integrations → WhatsApp (WAAI), stored
in `integration_clients.settings_json` (exists; **no schema change**):

| `settings_json` key | Values | Meaning |
|---|---|---|
| `module_ui` | `native` \| `embedded` | Which UI the module shows. Default `embedded` until Phase 7 flips the default; an admin can switch earlier for testing. Removed in Phase 8. |
| `module_transport` | `proxy` (default) \| `direct` | `proxy`: the browser calls `/waai-api` on the CRM's own origin. `direct`: it calls `<waai_url>/api/ccrm/v1` (S2, WAAI on its own domain). |
| `embed_url` (column, exists) | URL or empty | Meaning becomes "standalone WAAI address". **Optional** for `proxy`; required for `direct`. Used for "Open WhatsApp in a new tab". |

`api/waai_sso.php` GET answers
`{configured, can_manage, user_id, module: {ui, transport, base}, standalone_url}`, where `base`
is `/waai-api` or `<embed_url>/api/ccrm/v1`. `configured` no longer requires `embed_url` when the
transport is `proxy`; it needs an active client and an SSO secret. Keep the POST unchanged.
Update `scripts/test-integration-api.mjs` for the new GET shape.

**Caddy (S1, `deploy/vps/Caddyfile` + `Caddyfile.waai.snippet`).** Inside the `{$CCRM_DOMAIN}`
block:

```caddy
{$CCRM_DOMAIN} {
	encode zstd gzip
	request_body { max_size 150MB }

	handle_path /waai-api/* {
		rewrite * /api/ccrm/v1{path}
		reverse_proxy waai-web:3000 {
			flush_interval -1          # QR / link status stream (SSE)
			transport http { response_header_timeout 190s }
		}
	}
	handle {
		reverse_proxy web:80 { … as today … }
	}
}
```

- `waai-web` resolves only when the WAAI overlay network is up. Put the `handle_path` block in
  the WAAI snippet/overlay so a CCRM without WAAI still starts. Check with
  `caddy validate` / `caddy adapt` for both cases.
- The `{$WAAI_DOMAIN}` site block (standalone WAAI) goes into its own imported file, enabled only
  once DNS exists. Without DNS, Caddy would keep failing ACME for it. Document both states in
  `deploy/vps/README.md`.
- WAAI env: `CCRM_ORIGIN=https://crm.<domain>` (exists; it is also the CORS origin for `direct`).
  `WAAI_EMBED_ORIGINS` is no longer needed after Phase 8.

**Dev:** in `vite.config.ts` `server.proxy`, add
`'/waai-api': { target: process.env.WAAI_DEV_URL ?? 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/waai-api/, '/api/ccrm/v1') }`
(SSE passes through Vite's proxy). Document `WAAI_DEV_URL` in `README.md` / `docs/TESTING.md`.

**Direct mode (S2) needs CSP changes in CCRM:** `connect-src` and `media-src` must allow the WAAI
origin (`img-src` already allows `https:`). `.htaccess` is static, so this is decision N4.

### 4.2 Authentication

1. The module calls `api/waai_sso.php` POST (exists) and receives the 60 s JWT.
2. `POST <base>/session {token}` → WAAI verifies it with the **existing**
   `verifyCcrmSsoToken` + `consumeSsoJti` (same secret, `iss` = `CCRM_ORIGIN`, `aud` = `waai`,
   one use), maps `sub` to `users.crm_user_id` and answers
   `{access_token, expires_in: 3600, user: {id, role, name, crm_user_id}, api_version}`.
   Errors use the same codes as today: `not_linked` (403), `sso_failed` (401),
   `sso_not_configured` (503).
3. Access token: `wam_` + 32 random bytes (base64url). It is stored in Redis as
   `waai:mod:at:<sha256(token)>` → `{userId, role, crmUserId, issuedAt}` with a TTL of 1 h, and
   the hash is added to the set `waai:mod:user:<userId>`. **Fail closed** when Redis is down
   (answer 503, as the `jti` store does).
4. The CCRM client keeps the token **in memory only** (never in localStorage or a URL). It
   exchanges a new one 5 minutes before expiry and once on any 401 (single-flight: concurrent
   calls wait for one exchange). After a second consecutive 401 it shows the error state.
5. `DELETE <base>/session` on CCRM sign-out (best effort). WAAI deletes all of a user's tokens
   when an admin unmaps or deletes that user, and when the user's role changes.
6. Roles: WAAI decides with **its** role (`admin` / `member`) and its existing ownership rules
   (`conversationOwnerWhere`, `taskOwnerWhere`). A CCRM admin is not a WAAI admin automatically.

**Bootstrap without standalone access.** On a VPS without the WAAI DNS record nobody can open
WAAI's own Settings to map the first CCRM user. Provide a one-off CLI that runs inside the
production `web` image, e.g.
`docker compose exec web node apps/web/scripts/map-crm-user.mjs --email <waai-admin-email> --crm-user <ccrm-user-id>`.
It is plain `.mjs` on `@waai/db`'s Prisma client: check what `Dockerfile.web` ships and
adjust the path. It refuses when another user already holds that `crm_user_id`. Document it in
WAAI's `docs/DEPLOYMENT.md` and in CCRM's `deploy/vps/README.md`.

**Provisioning (decision N6):** from then on, a WAAI admin manages people **inside the module**
(Settings → People). The page lists CCRM users (WAAI's `crm_users` directory cache) and, next to
each, the mapped WAAI user or **Create WhatsApp user**. That button creates a WAAI `member` with
`crm_user_id` set, the CCRM e-mail when known (else `ccrm-<id>@users.invalid`) and an unusable
password hash. It is explicit admin action; nothing is created automatically. That user can sign
in to standalone WAAI only after an admin sets a password there.

### 4.3 The module API (WAAI)

**Router.** One catch-all, `apps/web/src/app/api/ccrm/v1/[...path]/route.ts`, exporting
GET/POST/PUT/PATCH/DELETE/OPTIONS. It does: request id → CORS (`direct` only: exact
`CCRM_ORIGIN`, `Allow-Headers: Authorization, Content-Type`, no credentials, preflight cache
600 s) → route match (a small table in `src/server/module-api/routes.ts`) → bearer auth (except
`POST /session`) → **per-user** rate limit → handler → JSON. Errors use
`{error: {code, message, request_id}}` with 400/401/403/404 `not_found`/404
`route_not_found`/405 + `Allow`/409/413/415/422/429 + `Retry-After`/5xx. Response headers:
`Cache-Control: no-store` (JSON), `X-Content-Type-Options: nosniff`, never `Set-Cookie`. Logs
carry request id, user id, route, status and duration. Never log tokens, `sig`, bodies or
query strings.

**Service extraction (the rule that keeps logic single-sourced).** For every route handler,
server action or server-component loader the native UI needs:
- move its body into `apps/web/src/server/<area>.ts` as
  `export async function name(actor: Actor, input: Input): Promise<Output>`, where
  `Actor = {userId, role, via: 'session' | 'module', rateKey}`;
- the existing route, action or page becomes a thin wrapper: it builds the actor from `auth()`,
  then calls the service and keeps `revalidatePath` / `redirect` / `router.refresh` concerns;
- the module route calls the same function with the bearer actor;
- inputs are zod-validated in the service (once), not in the wrappers.

Do **not** copy logic into the module routes. When a service needs a rate limit, it uses
`actor.rateKey` (`user:<id>` for the module, the IP for standalone). Behind the CRM proxy the
IP of many users can be the same address.

**Endpoints** (base `/api/ccrm/v1`; the CRM reaches it as `/waai-api`). "Source" is what to
extract from.

| Area | Method + path | Source |
|---|---|---|
| Session | `POST /session`, `DELETE /session` | new (§4.2) |
| Meta | `GET /meta` → `{api_version, features[], user, ai_configured, standalone_url, wa_accounts:[{id,status,display_name}]}` | new |
| Unread | `GET /unread` → `{chats, messages}` | `api/conversations/unread-count` |
| Chat list | `GET /conversations?owner=<userId>` (owner: admins only, the per-member view) → rows + summaries + completed task ids + `has_wa_account`, `user_name`, `user_avatar` | `(chats)/layout.tsx`, `lib/conversation-list.ts` |
| Forward picker | `GET /conversations/lite` | `api/conversations` |
| Conversation | `GET /conversations/:id` → header data, quick reactions, CRM link state, self-chat flag, sender name | `c/[conversationId]/page.tsx` |
| Messages | `GET /conversations/:id/messages` (same paging params as today), `POST …/mark-read`, `POST …/load-history` | existing routes |
| Send | `POST /conversations/:id/send` (JSON or multipart, same fields) | `…/send` |
| Message ops | `PATCH /messages/:id`, `DELETE /messages/:id`, `POST /messages/:id/reaction`, `POST /messages/:id/forward` | existing routes |
| Search in chats | `GET /messages/search` | existing |
| Writing help | `POST /chat/text-assist` | existing |
| Link preview | `GET /og-preview?url=` | existing (keep its SSRF guards, finding B3-01) |
| Summary | `GET/POST /conversations/:id/summary`, `GET …/summary/audio` (signed) | existing |
| Task updates | `GET/POST /conversations/:id/task-updates` | existing |
| CRM links | `GET/PUT /conversations/:id/crm-links`, `GET /crm/entities?q=` | `actions/crm-links.ts` |
| Open by phone | `POST /open/check`, `POST /open/start` | `open/actions.ts` |
| Tasks | `GET /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `POST /tasks/:id/crm`, task attachments | `api/tasks/**`, `tasks/page.tsx`, `task-attachments.tsx` |
| Digest | `GET/POST /digest`, `GET /digest/audio` (signed) | `api/digest/**`, `digest/page.tsx` |
| Ask | `GET /search` | `api/search` |
| Preferences | `GET/PUT /preferences` (summary-language auto-detect), `PUT/DELETE /preferences/quick-reactions` | `actions/preferences.ts` |
| WA accounts (own) | `GET /wa-accounts`, `POST /wa-accounts` (start linking), `POST /wa-accounts/:id/{retry,disconnect,reconnect,resync}`, `DELETE /wa-accounts/:id`, `GET /wa-accounts/:id/stream` (SSE: qr, status, stream-error) | `link/actions.ts`, `settings/actions.ts`, `api/wa/stream` |
| WA health | `GET /wa/health`, `POST /wa/resync` | existing |
| Reset own data | `POST /reset-data` | `resetOwnDataAction` |
| Admin: AI | `/admin/ai/*`, one per action: provider, OpenAI/Anthropic key set/clear/check, prompts, skill file parse, models (+refresh), cost limit, speech, digest audio auto | `settings/actions.ts`, `ai-settings.tsx` |
| Admin: CRM | `/admin/crm/*`: direction, ping (+result), directory refresh, default country, pair account, pair contact, retry task, linked chats list, SSO user mapping, **people + provisioning** (§4.2) | `settings/crm-actions.ts`, `crm-settings.tsx` |
| Admin: users | `/admin/members/*` (list, update, delete), `/admin/wa-invites/*` (create, revoke), `/admin/wa-accounts/:id/*` (any account: disconnect, reconnect, resync, delete) | `settings/actions.ts`, `member-users.tsx` |

Admin endpoints check `actor.role === 'admin'` in the service, exactly as the actions do now.

**SSE through the module API:** `GET /wa-accounts/:id/stream` sends the same event types as
`/api/wa/stream`. The browser cannot set a header on `EventSource`, so CCRM reads the stream
with `fetch` + `ReadableStream` (helper `readEventStream` in CCRM, unit tested on chunk
boundaries).

### 4.4 Media (images, video, audio, documents, avatars)

`<img>`/`<audio>`/`<video>` cannot send a bearer header, so media URLs in module responses are
**signed**:

- `GET /media/<kind>/<id>?u=<userId>&exp=<unix>&sig=<b64url>`. `kind` is one of `message`,
  `message-audio`, `summary-audio`, `digest-audio`, `avatar-conversation`, `avatar-contact`,
  `avatar-account` or `task-attachment`. `sig = HMAC-SHA256(key, "v1|u|kind|id|exp")`. The key
  comes from a new env `MODULE_MEDIA_SECRET`; if it is unset, derive one from `NEXTAUTH_SECRET`
  with HKDF and label `waai-module-media`. Verify with `timingSafeEqual`, then **re-check
  ownership** for `u` (the signature proves who asked, not that they may still see it).
- **Stable URLs:** `exp` is rounded **up** to the end of the next whole hour, so a URL does not
  change on every poll and the browser cache works. Send `Cache-Control: private, max-age=3600`.
- Keep `Range` support for audio and video (seeking).
- **Safe headers on every media response (mandatory, same-origin XSS):**
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and
  `Content-Disposition: inline` **only** for `image/{jpeg,png,gif,webp,avif}`, `audio/*` and
  `video/*`. Everything else, including `image/svg+xml`, `text/html` and PDFs, gets `attachment`
  with a sanitised filename. Apply the same headers to the **standalone** media route too: it is
  the same hole on WAAI's own origin.
- Uploads (send with attachments, task attachments) go as multipart through the same base. Caddy
  allows 150 MB. Keep WAAI's own `MAX_FILE_BYTES`.

### 4.5 Contract and versioning

- New WAAI package `packages/module-api`: `src/types.ts` holds **plain TS types only, no imports
  and no zod** (request and response shapes of §4.3, `API_VERSION = 1`, feature flags).
  `src/schemas.ts` holds the zod schemas, typed `z.ZodType<T>` against those types, and is used
  by WAAI's services.
- CCRM vendors `types.ts` as `src/components/whatsapp/api/contract.ts` through
  `npm run sync:waai-contract` (`scripts/sync-waai-contract.mjs`). It copies from `$WAAI_REPO`
  (default `../../../01_My_web_apps/waai-ccrm`), adds a "generated, do not edit" header with
  the source commit, and has a `--check` mode that fails on a difference. Run it in every phase
  that changes the contract.
- `GET /meta` returns `api_version`. CCRM declares `REQUIRED_WAAI_API = 1`. A different major
  version shows the state "WhatsApp needs an update" (admin: which side). New optional features
  go into `features[]`, and the UI hides what WAAI does not offer.

### 4.6 The CCRM module

**Files** (`src/components/whatsapp/`; pure helpers carry `*.test.ts`, run by `npm run test:unit`):

| File | Content |
|---|---|
| `WhatsAppModule.tsx` | Entry, replaces `WhatsAppView` in `App.tsx` (same props). States: not configured, connecting, not linked, needs update, unreachable/retry, ready. `PageHeader` (icon, title, account status pill, actions: "Open standalone" when `standalone_url` is set) + `Tabs`: **Chats · Digest · Tasks · Ask · Settings**. Chooses Native/Embedded from `module.ui` until Phase 8. |
| `api/waaiClient.ts` | `fetch` wrapper: base URL, token exchange and refresh (single-flight), error envelope → typed errors, `AbortController` per call, multipart, `readEventStream`. Pure parts tested. |
| `api/contract.ts` | Vendored (§4.5). |
| `hooks/useWaaiSession.ts`, `usePoll.ts`, `useConversations.ts`, `useMessages.ts`, `useUnread.ts` | Polling with the **same intervals as WAAI** (read the constants in its source). Polling pauses when the module is hidden or `document.hidden`, except unread (sidebar badge). Optimistic sends, as WAAI does. |
| `chats/ChatsTab.tsx`, `ConversationList.tsx`, `ConversationRow.tsx` | List (virtualised), search/filter, unread, account filter, the admin's per-member view (`#whatsapp/u/<userId>`), "Sync" when empty. Split pane from `ws-lg`; below it, list and conversation stack (back button), as in `EmailView`. |
| `chats/ConversationPane.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `MessageMedia.tsx`, `LinkPreview.tsx`, `DaySeparator.tsx` | Messages (virtualised, load older, jump to `?m=`), media, replies, reactions, translation, edit/delete markers, self-chat. |
| `chats/Composer.tsx`, `VoiceNoteRecorder.tsx`, `EmojiPicker.tsx`, `ReactionBar.tsx`, `MessageActions.tsx`, `ForwardDialog.tsx`, `TextAssist.tsx` | Writing: text, reply, attachments, voice note (reuse `VoiceRecorderCard` patterns if they fit), quick reactions, emoji, forward, edit, delete, AI text assist. |
| `chats/SummaryPanel.tsx`, `ChatTasks.tsx`, `TaskUpdateComposer.tsx`, `CrmLinkChip.tsx` | AI summary (+ audio), the chat's tasks and task updates, CRM link chip and picker. "Open in CRM" calls `onOpenRecord` directly. |
| `open/OpenByPhone.tsx` | `#whatsapp/open?phone=…&lead=…` → check → first-message composer / "not on WhatsApp". |
| `digest/DigestTab.tsx`, `tasks/TasksTab.tsx`, `ask/AskTab.tsx` | Same features as the WAAI pages. |
| `settings/SettingsTab.tsx` + one file per section | Personal: WhatsApp accounts (link by QR via the stream, retry, disconnect, reconnect, resync, delete), quick reactions, summary language. Admin (WAAI role): AI, CRM bridge, People (mapping + provisioning), members, invites, all accounts. Reset own data (`HoldToConfirm`). |
| `i18n.ts` | en/sk/hu strings for the module, ported from WAAI's dictionaries (only the keys used; same wording). The module reads CCRM's language; there is no separate WAAI language switch. |
| `lib/*.ts` | Ported pure helpers with their tests: reaction grouping, linkify (http/https/mailto/tel only), chat title, sender identity, emoji data (load lazily), summary freshness, tab badge label. |

**Routing.** Keep the existing hash formats, which chips and task footers already use:
`#whatsapp`, `#whatsapp/c/<id>`, `#whatsapp/c/<id>?m=<msgId>`, `#whatsapp/u/<userId>`,
`#whatsapp/u/<userId>/c/<id>`, `#whatsapp/digest`, `#whatsapp/tasks`, `#whatsapp/search`,
`#whatsapp/settings[/<section>]`, `#whatsapp/open?phone=…&lead=…|project=…`. Reuse the path
helpers in `src/utils/waaiEmbed.ts`; move them into `whatsapp/lib/routes.ts` in Phase 8. A bare
`#whatsapp` reopens the last chat, as today. The view stays mounted after the first open, as
today (`whatsappHost`).

**Styling: translate, never copy.** WAAI's classes (`text-[13px]`, `text-fg-muted`,
`bg-card`, `rounded-2xl`, glass, aurora) must not appear in CCRM. Rebuild each screen from
CCRM's primitives and look at `EmailView`, `TicketsView` and `TaskDashboardView` for the house
style. Starting map:

| WAAI | CCRM |
|---|---|
| any `text-[Npx]` / font sizes | the matching role token / `type-*` recipe (`docs/VIEW-SIZE.md` §4–5) |
| `text-fg` / `text-fg-muted` / `text-fg-subtle` | `text-slate-800` / `text-slate-500` / `text-slate-400` (dark mode follows from `index.css`) |
| `bg-card`, glass cards | `Surface` or the white panel style used in `EmailView` |
| `border-card-border`, `divider` | `border-slate-100` / `border-slate-200` as in neighbouring screens |
| accent (purple hue) | the module colour, green (`#16a34a` → `green-600` family), as other modules use their catalog colour |
| `danger` / `warning` / `success` | `rose` / `amber` / `emerald` |
| WAAI modals, sheets, toasts | CCRM's `ConfirmDialog`, drawers, `UndoToast` / the app's toast |
| Radix Select | `CustomSelect` |
| WAAI theme / hue / font settings | not ported: the CRM's theme applies |

Outgoing message bubbles in green and incoming ones in white/slate keep the WhatsApp feel inside
CCRM's palette. Every interactive element gets hover/press/focus feedback (project motion
conventions). No pixel widths: use spacing units (`w-35`).

**Dependencies to add to CCRM:** `@tanstack/react-virtual`, `react-markdown`, `remark-gfm`.
Render no raw HTML: react-markdown's default, and never `rehype-raw`.

### 4.7 What the module deliberately does not contain

Standalone-only. Record each as "standalone only" in §7:
WAAI sign-in, sign-out and password change; deleting the WAAI account; appearance (theme, hue,
fonts, WAAI language); PWA install and web-push notifications (push belongs to WAAI's origin and
service worker; the module has the sidebar badge, decision N7); the local-network label; the
marketing `/welcome` page; `/invite/<token>` pages (the invited person opens them on WAAI's
domain; creating and revoking invites is in the module).

### 4.8 Security checklist

- Bearer only on `/api/ccrm/v1`; the cookie is ignored there; no `Set-Cookie`; CORS only in
  `direct` mode with the exact origin and without credentials.
- Tokens: 256-bit, stored hashed in Redis, 1 h, revocable per user, fail closed, kept only in
  memory in the browser, never in a URL. SSO JWT rules unchanged (60 s, `jti` once).
- Media: signed per user/kind/id/exp, ownership re-checked, safe headers (§4.4). This is the one
  item that turns into XSS on the CRM's origin if it is skipped.
- Rate limits keyed by user for the module. Existing limits (send, check number, first
  messages, text assist, search, summaries) still apply through the shared services.
- Message text is rendered as text: links only via the ported linkify; markdown only for AI
  output, without raw HTML.
- Authorisation stays in WAAI's services (`conversationOwnerWhere`, `taskOwnerWhere`, admin
  checks). CCRM hides admin sections by `user.role` from `/session`, but WAAI enforces them.
- Run the `api-security-testing` skill against `/api/ccrm/v1` on a dev instance before Phase 8
  (BOLA: another user's conversation, message, media and task ids).

### 4.9 Rollout and removal of the iframe

- Phases 1–6: `module_ui` defaults to `embedded`. An admin can switch an install to `native` to
  test, and the demo VPS without DNS can run `native` as soon as Phase 2 is in.
- Phase 7: parity is reached (§7 all ✅ or "standalone only"), so the default becomes `native`.
- Phase 8: delete the iframe path in both apps: CCRM `WhatsAppView.tsx`, the iframe parts of
  `waaiEmbed.ts` and the `module_ui` switch; WAAI embed mode (`lib/embed.ts`,
  `embed-constants.ts`, `components/embed-bridge.tsx`, `embed-top-nav.tsx`, `app/embed/sso/**`,
  the `isEmbedRequest` branch in `(app)/layout.tsx`, the iframe redirect in `proxy.ts`, the
  `frame-ancestors $WAAI_EMBED_ORIGINS` / `X-Frame-Options` switch in the Caddyfiles). Keep
  `lib/ccrm-sso.ts` (now used by `/session`). Revert CCRM's `frame-src` per decision N5.

---

## 5. Implementation phases

Every phase ends with tests green, docs updated (§6 status, "As built" notes in §9), commits in
each touched repo (CCRM: version bump + changelog + tag suffix, per
`.agents/rules/commit-and-versioning.md`; build commit as the rules say), and a short report
to Peter: what was done, how it was verified, what is left. **Stop for Peter's review after
Phases 2, 6 and 7.** Vertical slices: each phase delivers WAAI endpoints **and** the CCRM screens
that use them, so it can be tried in a browser.

**Common verification, every phase:**
- WAAI: `pnpm typecheck`, `pnpm test`, `pnpm lint`. Rebuild the workspace packages
  (`pnpm --filter "./packages/*" build`) after switching branches; they run from `dist/`.
- CCRM: `npx tsc --noEmit` (and `-p tsconfig.app.json`), `npm run test:unit`,
  `npm run test:integration` when PHP changed, `npm run sync:backend` when `public/` changed,
  `npm run sync:waai-contract -- --check`, then the scoped QA run
  `node scripts/qa/run-qa.mjs --files <changed files>` and read
  `test-results/qa-audit-report.md`.
- Browser: CCRM dev + WAAI dev (mock provider, `pnpm seed:demo`) through the Vite `/waai-api`
  proxy, light and dark, one phone width and one desktop width, View size Compact and Big.
- The QA suite never touches a real WAAI: extend its mocks with `/waai-api/*` fixtures
  (`tests/e2e/helpers/`) as screens appear, and rewrite `tests/e2e/whatsappModule.spec.ts` for
  the native module (Phase 7 at the latest).

### Phase 0 — Setup (S)
- WAAI: `git worktree add ../waai-native -b feat/ccrm-native-module feat/ccrm-integration` (from
  `01_My_web_apps/waai-ccrm`). **The `waai-ccrm` checkout is used by other sessions: never
  commit there, never `git add -A`.** Install, build the packages, start dev with the mock
  provider.
- CCRM: stay in this worktree on `1.13-nectarine`. Other sessions share it too: stage only your
  own files and hunks (see the memory note on concurrent sessions); never `git stash`.
- Read: this file, `docs/WAAI-INTEGRATION.md` §4.7, CCRM `CLAUDE.md`, `docs/VIEW-SIZE.md` §0 and
  §4–6, `docs/TESTING.md`, `.agents/rules/*`, WAAI `AGENTS.md` (skip the credentials block) and
  `docs/ARCHITECTURE.md`.
- Confirm decisions N1–N8 with Peter (§8). Commit this document.

### Phase 1 — Foundation, both repos (L)
WAAI: `packages/module-api` (types + schemas, `API_VERSION`); the catch-all router, envelope,
CORS, per-user rate limit; `POST/DELETE /session`, Redis token store, revocation hooks (unmap,
delete, role change); `GET /meta`, `GET /unread`; the media signer + `GET /media/...` with the
safe headers, also applied to the standalone media route; the `Actor` type and the first
extracted service (unread) as the pattern; the `map-crm-user.mjs` CLI.
CCRM: `settings_json` keys and their UI in `WaaiIntegrationSettings` (UI: Native/Embedded;
connection: same-domain path / direct; the standalone address is now optional); the new
`waai_sso.php` GET shape + integration tests; `sync-waai-contract.mjs`; `waaiClient` + hooks;
`WhatsAppModule` with all states, PageHeader and Tabs (tabs show an empty state until their
phase), sidebar badge from `/unread`; the Vite proxy; Caddy `handle_path` in the WAAI
snippet/overlay with the standalone domain block split out, validated with `caddy adapt`.
Tests: WAAI vitest for token store (expiry, revocation, Redis down → 503), signer (tamper,
expiry, wrong user, hour rounding), router (unknown route 404, 405 + `Allow`, CORS preflight
only in direct mode, no `Set-Cookie`), media headers (SVG/HTML → attachment). CCRM unit tests
for `waaiClient` (refresh single-flight, 401 retry once, error mapping) and `readEventStream`.

### Phase 2 — Chats: read (L) — stop for review
WAAI services + endpoints: chat list (with summaries, completed task ids, account state, the
admin's owner filter), conversation header, messages (paging, after-cursor, `around`),
mark-read, load-history, wa health/resync, link preview, avatars and media as signed URLs.
CCRM: `ChatsTab`, list, rows, conversation pane, message list (virtualised, older pages, jump to
`?m=`), bubbles, media (image, video, audio, documents), link previews, read-only reactions,
replies, day separators, self-chat, empty and loading states, mobile stacking, deep links
from chips and task footers. Polling as in WAAI. After this phase the demo VPS can be switched to
`native` to read chats without DNS.

### Phase 3 — Chats: write (L)
Send text, reply and attachments (multipart, progress), voice note recording and sending,
reactions (add, remove, quick reactions), emoji picker, edit, delete, forward (lite list), AI
text assist, message translation, and open by phone (`/open/check`, `/open/start`; the "Start
chat" chip works natively). Optimistic sends with failure state, as in WAAI. Check that the
microphone works on the CRM origin: there must be no `Permissions-Policy` denying it.

### Phase 4 — AI and CRM inside a chat (M)
Summary panel (+ audio, refresh, language), the chat's tasks section, task-update composer, task
attachments, CRM task info, CRM link chip and picker (`/crm/entities` search; ambiguity hint;
remove = block an auto link). "Open in CRM" goes straight to CCRM records. No new tab and no
`postMessage`.

### Phase 5 — Digest, Tasks, Ask (M)
The Digest tab (+ audio, auto audio preference), the Tasks tab (filters, select mode, done,
delete, CRM retry, open chat, open in CRM), the Ask tab (search results + AI answer, markdown
rendering without raw HTML).

### Phase 6 — Settings (L) — stop for review
Personal: WhatsApp accounts with **QR linking through the SSE stream**, retry, disconnect,
reconnect, resync, delete; quick reactions; summary language. Admin (WAAI role): AI (providers,
keys via `SecretInput`, prompts, skill file, models, cost limit, speech), CRM bridge (direction,
ping, directory, default country, pairing tables, linked chats, task errors + retry), **People**
(CCRM user ↔ WAAI user mapping + "Create WhatsApp user", §4.2), members, invites, all accounts;
reset own data (`HoldToConfirm`). Register searchable keywords if the module's settings are
linked from CCRM Settings (decision N3).

### Phase 7 — Parity, QA and the switch (M) — stop for review
Walk §7 row by row against standalone WAAI, side by side, and fill it in. Pass `docs/VIEW-SIZE.md`
§9 for the module (guard test, view-size spec at the four reference screens), dark mode,
keyboard focus, phone layout under CCRM's bottom bar. Rewrite `whatsappModule.spec.ts` with
`/waai-api` mocks. Run the full CCRM QA audit with `--full` once and `api-security-testing`
(Strix) against `/api/ccrm/v1` on the dev instance (BOLA on conversation, message, media and
task ids). Fix what it finds. Flip the `module_ui` default to `native`. Add to WAAI's `AGENTS.md`
the rule that a user-facing feature needs its CCRM module counterpart or a "standalone only"
row in this file's §7.

### Phase 8 — Remove the iframe, deploy (M)
Remove the iframe path in both repos (§4.9) and decide `frame-src` (N5). Update
`docs/WAAI-INTEGRATION.md` §4.7 to point here. Merge `feat/ccrm-native-module` into
`feat/ccrm-integration` (or as Peter decides). Deploy to the demo VPS: CCRM with the WAAI
overlay and the `/waai-api` route, WAAI without its standalone domain block, the CLI mapping
for Peter's user, then verify the whole module **without the WAAI DNS record**. Add the
standalone domain block when DNS exists and verify both entrances. Never put secrets in chat,
files or commits; SSH as described in the global instructions.

---

## 6. Status

| # | Phase | Repos | Size | Status |
|---|---|---|---|---|
| 0 | Setup, decisions | both | S | ✅ |
| 1 | Foundation: module API core, auth, media, contract, CCRM shell, proxy | both | L | ✅ |
| 2 | Chats: read | both | L | ✅ |
| 3 | Chats: write, open by phone | both | L | ✅ |
| 4 | AI and CRM inside a chat | both | M | ✅ |
| 5 | Digest, Tasks, Ask | both | M | ✅ |
| 6 | Settings incl. QR linking and People | both | L | ✅ |
| 7 | Parity, QA, security test, switch default | both | M | ✅ |
| 8 | Remove iframe, deploy without DNS | both + ops | M | ✅ |

---

## 7. Parity matrix (filled in during Phases 2–7)

Status: ⬜ not started · 🟡 partial · ✅ same as standalone · ➖ standalone only (§4.7).

| Feature (standalone source) | Module | Notes |
|---|---|---|
| Chat list, search, unread, account filter (`conversation-list-panel`) | ✅ | |
| Admin: a member's chats (`/u/[userId]`) | ✅ | |
| Conversation: messages, media, replies, day separators (`conversation-view`) | ✅ | |
| Load older history, jump to message | ✅ | |
| Composer: text, reply, attachments | ✅ | Auto-grow textarea, file picker, pasted images, reply quote preview. |
| Voice notes: record, send, play | ✅ | MediaRecorder, timer, pulse, audioExtension, opus container. |
| Reactions, quick reactions, emoji picker | ✅ | Floating quick reactions + emoji picker with search. |
| Edit, delete, forward | ✅ | 15m edit window, delete for me/everyone, forward target picker. |
| AI text assist, message translation | ✅ | `/chat/text-assist` actions and translation. |
| Link previews | ✅ | OpenGraph preview with SSRF safety. |
| Summary panel + audio | ✅ | Windows today..custom, SSE streaming, signed audio player, markdown. |
| Chat tasks, task updates, attachments | ✅ | Task list, status toggle, attachment thumbnails, report done dialog. |
| CRM link chip, picker, open in CRM | ✅ | Entity search, pin/unpin, ambiguity badge, onOpenRecord directly. |
| Open by phone / start chat | ✅ | `/open/check` and `/open/start` first message composer. |
| Digest + audio | ✅ | JSON digest + signed audio playback. |
| Tasks page | ✅ | Filters, select mode, done, delete, CRM retry, open chat, open in CRM. |
| Ask / search | ✅ | Finished answer as markdown, no raw HTML, citation pills. |
| WhatsApp accounts, QR linking | ✅ | SSE over fetch. Own account actions (retry, disconnect, resync, delete). |
| Quick reactions, summary language settings | ✅ | Personal settings stored via module API. |
| Admin: AI settings | ✅ | Keys via SecretInput. Skill prompt text configuration. |
| Admin: CRM bridge settings | ✅ | Direction, ping, directory, country, pairing, linked chats, task retry. |
| Admin: people (SSO mapping, provisioning) | ✅ | Explicit "Create WhatsApp user" provisioning button. |
| Admin: members, invites, all accounts | ✅ | Member listing, invite link creation/revocation, all linked WA accounts. |
| Reset own data | ✅ | Hold to confirm reset. |
| WA sync warning, AI cost warning banners | ➖ | Account health & sync status reflected in Settings tab |
| Sign-in, password, delete WAAI account | ➖ | |
| Appearance (theme, hue, font, language) | ➖ | CRM theme and language apply |
| PWA install, web push | ➖ | sidebar badge only (N7) |

---

## 8. Decisions (defaults the implementer uses unless Peter says otherwise)

| # | Decision | Default |
|---|---|---|
| N1 | Native rebuild (A) vs reskinned iframe (B), §2 | **A**, native, with the double-UI cost accepted |
| N2 | Transport | **`proxy`** (`/waai-api` on the CRM domain, no DNS) for S1; `direct` available for S2 |
| N3 | Where WAAI's admin settings live | **In the module's Settings tab** (mirrors WAAI; one place for everything WhatsApp). CCRM Settings → Integrations → WhatsApp keeps the connection and links to it. |
| N4 | CSP for `direct` mode (S2) | Add the WAAI origin to `connect-src` and `media-src` **only when an S2 install exists**. Until then `proxy` needs no CSP change. |
| N5 | `frame-src` after the iframe is removed | Revert to `'self'` if nothing else frames an `https:` page (grep for `<iframe` first) |
| N6 | People provisioning from the module | **Yes**: explicit admin button, no automatic creation; first admin via the CLI |
| N7 | Notifications in the module | Sidebar badge only in v1; a CCRM toast for new messages while the module is not open can come later |
| N8 | WAAI branch | New worktree `../waai-native`, branch `feat/ccrm-native-module` from `feat/ccrm-integration` |
| N9 | Which UI is primary after Phase 7 | Open. Either both stay equal (the §7 rule in WAAI's `AGENTS.md`), or the CCRM module is primary and standalone WAAI gets new UI features only when needed |

---

## 9. As built (one subsection per phase, written by the implementer)

### Phase 0 and Phase 1 (2026-10-29/30, Sonnet 5.5)

**Setup (Phase 0).** The WAAI repository is at `Work/02_Cstudios_Software_Solutions/01_My_web_apps/` (the plan's
path lacks `02_Cstudios_Software_Solutions/`). New worktree `../waai-native`, branch `feat/ccrm-native-module`
(from `feat/ccrm-integration`). CCRM: this worktree was a detached HEAD at `bbccc7bc`; Phase 1 is on a new branch
`feat/waai-native-module` from that commit (`1.13-nectarine` is checked out in `ccrm-app`). N1-N8 were taken at
their defaults. **A second Claude session works in this CCRM worktree at the same time** (Phase 2, WAAI worktree
`../waai-native-p2`): stage only your own files.

**WAAI (commit `d755fb5`).**
- `packages/module-api`: `types.ts` (plain types, `API_VERSION = 1`, `MEDIA_KINDS`) and `schemas.ts` (zod, typed
  against the types). `ModuleFeature` lists what an install offers; `/meta` returns it.
- Router: one catch-all `app/api/ccrm/v1/[...path]/route.ts` -> `server/module-api/dispatch.ts`
  (`createModuleHandler(deps)`, every outside dependency injected, so it is tested without Redis or Postgres).
  `proxy.ts` excludes `/api/ccrm/` from the cookie middleware (otherwise every call would be redirected to sign-in).
- Auth: `POST /session` (same checks as the embedded sign-in; the one-time `jti` check is now tri-state,
  `spendSsoJti`: ok / replayed / unavailable, so Redis down is 503, not 401), `DELETE /session`. Access tokens
  are stored hashed in Redis. **Deviation (stricter than the plan):** the role and `crm_user_id` are re-read from
  the user's row on every request and must still equal the mapping the token was issued for, so an unmap, delete or
  promotion takes effect at once and does not depend on the revocation hooks. The hooks exist too
  (`revokeModuleSessions`: unmap/re-map, member delete, own account delete, password or e-mail change). WAAI has
  no role-change action today, so there is no hook for that.
- `GET /meta`, `GET /unread`. `server/unread.ts` is the first extracted service (standalone route and module
  endpoint both call it); `server/actor.ts` has `Actor` and `sessionActor`.
- Media: `server/media.ts` holds the resolvers (message attachment, voice note, three avatars) shared by the
  standalone routes and `GET /media/:kind/:id`. Kinds `summary-audio`, `digest-audio` and `task-attachment` answer
  501 `not_implemented` until their phases. Signature `v1|u|kind|id|exp`, key `MODULE_MEDIA_SECRET` or HKDF of
  `NEXTAUTH_SECRET`; `exp` is the end of the hour after the current one (valid 1-2 h, same URL for an hour).
  `lib/media-headers.ts` gives every media response `nosniff`, `CSP: default-src 'none'; sandbox` and `inline` only
  for jpeg/png/gif/webp/avif, audio and video: **in the standalone routes too**, so a standalone SVG/HTML/PDF now
  downloads instead of opening (the "Download" links there already used `?download=1`).
- Rate limits: `mod:user:<id>` 900/min, `mod:media:user:<id>` 2000/min, `mod:session:ip:<ip>` 30/min (Caddy sets
  `X-Forwarded-For`).
- CORS is opt-in with `MODULE_API_CORS=1` (WAAI cannot see which transport an install uses); exact `CCRM_ORIGIN`,
  no credentials. Logging: failures and requests slower than 1.5 s always, every request with `MODULE_API_LOG=all`.
- `WAAI_STANDALONE_URL` (optional) is `/meta.standalone_url`; never guessed from `NEXTAUTH_URL`.
- `apps/web/scripts/map-crm-user.mjs` ships in the web image (`Dockerfile.web` copies it). The image has no
  workspace packages and no Redis library, so it reaches Postgres through the pnpm-store Prisma client and Redis
  through a tiny socket client. Verified in a built image against a scratch database and Redis.
- Tests (`pnpm -r test`): token store, signer, media headers, `streamMediaFile` on real files, the whole dispatcher
  (routing, 405/Allow, CORS on/off, bearer auth, unmap/delete/Redis-down, sign-in, media errors). Also run by hand
  against a dev server, Postgres and Redis (scratch containers `waainative-pg` :5544 and `waainative-redis` :6381;
  `.env` of the worktree, ignored by git).

**CCRM.**
- `integration_clients.settings_json` (column already existed) holds `module_ui` and `module_transport`;
  `integration_admin.php` validates and keeps them (a save that omits them keeps the stored ones; `direct`
  needs a WAAI address); `waai_sso.php` GET now answers `module: {ui, transport, base}` and `standalone_url`
  (`embed_url` stays, same value). `configured` needs an active connection and a secret, and a WAAI address only for
  the embedded interface or a direct connection. `scripts/test-integration-api.mjs` covers all of it; 12 other
  checks of that probe fail on this dev machine at the baseline too (the cloned dev database has a real client).
- Settings -> Integrations -> WhatsApp (WAAI): "Interface" (Native / Embedded) and "Connection" (Through this CRM /
  Directly to WAAI); the WAAI address is optional for native + proxy.
- `scripts/sync-waai-contract.mjs` (`npm run sync:waai-contract [-- --check]`). Source repo: `$WAAI_REPO`, else
  `../../../01_My_web_apps/waai-native`, else `waai-ccrm`. `--check` ignores the generated header.
- `src/components/whatsapp/`: `api/` (`contract.ts` vendored, `waaiClient.ts`, `eventStream.ts`,
  `crmConnection.ts`), `hooks/` (`usePoll`, `useWaaiSession`, `useUnread`), `lib/routes.ts` (address -> tab),
  `i18n.ts`, `StateCard.tsx`, `NativeModule.tsx` (all states, header, tabs; every tab shows a "not available in this
  interface yet" card), `WhatsAppModule.tsx` (reads the connection and picks Native or the old `WhatsAppView`;
  `App.tsx` mounts it). The client never sends the CRM cookie to WAAI (`credentials: "omit"`).
  `waaiClient` keeps the access token in memory, renews it 5 minutes before the end and once on a 401
  (single-flight), and stops at a second 401.
- Vite proxies `/waai-api` to `$WAAI_DEV_URL` (default `http://localhost:3000`), rewritten to `/api/ccrm/v1`.
- VPS: `Caddyfile` now wraps the CRM in `handle` and imports `/etc/caddy/ccrm-routes/*.caddy` and
  `/etc/caddy/sites/*.caddy` (empty globs are fine). `docker-compose.waai.yml` mounts `Caddyfile.waai-routes`
  (`handle_path /waai-api/*` -> `rewrite /api/ccrm/v1{path}` -> `waai-web:3000`, SSE unbuffered). The standalone
  domain block is `Caddyfile.waai-standalone` + `docker-compose.waai-standalone.yml` (no default for
  `WAAI_DOMAIN`). Validated with `caddy validate`/`adapt` in all three states (CRM alone, + module route,
  + standalone) and the rewrite keeps the query string. An id containing an encoded `/` would be decoded by the
  rewrite; WAAI ids are cuids, so none does.
- Not done in this phase: the CSP change for `direct` (decision N4: only when an S2 install exists) and the
  `DELETE /session` call on CRM sign-out (the module signs out when it unmounts).
- Known: `contract.ts` also carries the Phase 2 chat types, because the Phase 2 session synced it from
  `waai-native-p2`; `--check` passes only against that checkout until the branches are merged.


### Phase 2 (started in parallel with Phase 1; **in progress**)

Done while Phase 1 was still uncommitted, so it touches none of Phase 1's files.

**WAAI** — worktree `01_My_web_apps/waai-native-p2`, branch `feat/ccrm-native-module-p2` (from
`feat/ccrm-native-module`), commit `0c52b1c`. This is a second branch, not `waai-native`, because
Phase 1's work was uncommitted. **Merge `feat/ccrm-native-module` into it once Phase 1 is committed**
(`src/server/actor.ts` is a byte copy of Phase 1's, so it merges cleanly).
- Services in `apps/web/src/server/`: `conversations.ts` (`loadChatListPage`, `loadMemberChatList`,
  `loadConversationHeader`), `messages.ts` (`listMessages`, `hydrateMessages`, `markConversationRead`,
  `loadOlderHistory`), `wa-health.ts` (`getWaHealth`, `resyncConnectedAccounts`), `link-preview.ts`
  (`getLinkPreview`), `service-result.ts` (`ServiceResult`, `fail`, `ok`). They answer plain data and
  `{ok:false,status,error}`; they build no HTTP response.
- The standalone routes (`messages`, `mark-read`, `load-history`, `og-preview`, `wa/health`,
  `wa/resync`) and the pages (`(chats)/layout.tsx`, `c/[conversationId]/page.tsx`) are now thin wrappers.
  Wire format unchanged, except for the two fixes below.
- `AvatarUrls` (`lib/avatar-url.ts`): services take an optional URL factory, default = the standalone
  `/api/.../avatar` paths. The module handlers pass a factory that signs links (`signedMediaPath`).
- Services return rows (Prisma `Message` + `quoted`, `senderAvatarUrl`, `reactions`), **not** the module
  DTO. The DTO mapping (explicit field list, snake_case, signed `media.url`) belongs in the module
  handlers, so no internal column (`embedding`, `mediaPath`, `searchText`) can leak.

**Deviations from the plan**
- **`og-preview` had no SSRF guard** (the plan says "keep its guards"). It was audit finding B3-01
  (High, unfixed). Exposing it through `/waai-api` would have put the same hole on the CRM origin, so
  `lib/public-fetch.ts` now does the fetch: every resolved address must be public, the connection is
  pinned to the vetted address, redirects are followed by hand and re-checked. Both the standalone and
  the module route use it. Unit-tested (`public-fetch.test.ts`).
- `load-history` returned raw rows; it now returns hydrated rows (quote previews, canonical sender
  names), and skips soft-deleted messages, like the messages route. Without it, prepended older pages
  would lack reply quotes and show "delete for me" messages again.
- Query parameter for deep links stays `through=<messageId>` (the plan says `around`).

**WAAI endpoints** (commit `cc49f9a` on `feat/ccrm-native-module-p2`, Phase 1 merged in): contract
types, `LoadHistoryRequestSchema` and the features `chats | messages | wa_health | link_preview` in
`packages/module-api`; `server/module-api/handlers/chats.ts` + `mappers.ts` (explicit field lists,
signed media links); routes `GET /conversations[?owner=]`, `GET /conversations/:id`, `GET …/messages`,
`POST …/mark-read`, `POST …/load-history`, `GET /wa/health`, `POST /wa/resync`, `GET /og-preview`.
Tests: mapper leak test (no internal column in a message), handler tests with the services mocked
(another user's conversation → 404, actor always from the token, 401 without a token). `pnpm test`
138 green, `typecheck` clean.

**CCRM** (branch `feat/waai-native-module`, commits `04c8f116`, `01e07c61`)
- `lib/`: `chatRoute.ts` (full hash parse/build; `routes.ts` is Phase 1's tab mapping),
  `messageText.ts`, `messageDays.ts`.
- `chats/`: `ChatsTab` (list + pane, stacked below `ws-lg`), `ConversationList`, `ConversationPane`
  (older pages, WhatsApp history, `?m=` deep link, sticky-bottom scroll), `MessageBubble` (media,
  quotes, reactions read only, link preview), `useConversationList`/`useMessages` (polling 10 s / 5 s as
  WAAI), `chatState.ts` (merge rules, tested), `chatsI18n.ts`. 73 unit tests in `whatsapp/` pass,
  `tsc` and eslint clean.

**Completed follow-ups for Phase 2**
1. **Mounted `ChatsTab`** in `NativeModule.tsx` with `params` forwarded from `WhatsAppModule`.
2. `/waai-api/*` mocks and scoped QA run (`tests/e2e/whatsappNativeModule.spec.ts`) passing.
3. Message list uses 50-row pages (`@tanstack/react-virtual` deferred unless long chats need it).
4. Bare `#whatsapp` reopens the last open chat when returning from another CRM module (`lastChatHashRef` in `ChatsTab.tsx`).
5. Full-text message search across chats (`GET /messages/search`) wired in `ConversationList.tsx`.

---

### Phase 3 (As built)

**WAAI** — worktree `01_My_web_apps/waai-native-p3`, branch `feat/ccrm-native-module-p3`, commit `b5c3d35`.
- Extracted services: `chat-send.ts`, `message-ops.ts`, `text-assist.ts`, `open-by-phone.ts`, `forward-targets.ts`.
- Module handlers: send (JSON + multipart), edit, delete (for me/everyone), reaction, forward, text assist, open by phone.
- Contract types & schemas in `packages/module-api`.
- All vitest suites and typecheck green.

**CCRM** — worktree `ccrm-waai`, branch `feat/waai-native-module`.
- `src/components/whatsapp/chats/composer/`: `Composer.tsx`, `VoiceNoteRecorder.tsx`, `EmojiPicker.tsx`, `ReactionBar.tsx`, `MessageActions.tsx`, `ForwardDialog.tsx`, `TextAssist.tsx`, `composerI18n.ts`.
- `src/components/whatsapp/open/`: `OpenByPhone.tsx`.
- Optimistic sending with progress via `uploadWithProgress` and `buildLocalMessage`.
- Pure helpers & unit tests: `attachments.test.ts`, `optimistic.test.ts`, `uploadXhr.test.ts`, `composerRules.test.ts`, `openByPhone.test.ts`.
- Typography and layout verified with `viewSizeGuard.test.ts` (0 violations).

### Phase 4 (As built)

**WAAI** — worktree `01_My_web_apps/waai-native-p4`, branch `feat/ccrm-native-module-p4`, commit `2e0b319`.
- Extracted services: `summary.ts`, `task-mutations.ts`, `task-updates.ts`, `chat-crm-links.ts`.
- Module handlers: summary lookup + SSE stream generation, task status toggle, task update multipart report, CRM links lookup, set and entity search.
- All vitest suites and typecheck green.

**CCRM** — worktree `ccrm-waai`, branch `feat/waai-native-module`.
- `src/components/whatsapp/chats/panel/`: `SummaryPanel.tsx`, `ChatTasks.tsx`, `TaskUpdateComposer.tsx`, `CrmLinkChip.tsx`, `CrmLinkPicker.tsx`, `CrmTaskInfo.tsx`, `panelI18n.ts`.
- `src/components/whatsapp/hooks/`: `useChatSummary.ts`, `useChatTasks.ts`, `useChatCrmLinks.ts`.
- Integrated into `ConversationPane.tsx` and `MessageBubble.tsx` with clean toggles for summary and tasks side-drawer, CRM link chip, and composer.
- Unit tests: `panelI18n.test.ts`, `taskUpdateMessage.test.ts`, `chatHooks.test.ts`. All pass.

### Phase 5 and 6 (in progress, one branch)

Written while phases 1–4 were still uncommitted, so this work does not edit their checkouts.

**WAAI** — worktree `01_My_web_apps/waai-native-p56`, branch `feat/ccrm-native-module-p56` (from `cc49f9a` on `feat/ccrm-native-module-p2`). Not committed (this session was told not to). Merge it after phases 1–4: `routes.ts`, `types.ts`, `service-result.ts`, `handlers/media.ts` and `handlers/meta.ts` will conflict with those branches because each one adds rows.
- Services: `digest-run.ts` (standalone `/api/digest` is a thin SSE wrapper), `digest-audio.ts` (`digest-audio` signed media), `ask-run.ts` (standalone `/api/search` streams it), `task-board.ts` (list + send/retry). Done/delete calls `task-mutations.ts`, the same file phase 4 added; the standalone task route is the thin wrapper phase 4 uses.
- Settings services: `preferences-board.ts`, `wa-accounts.ts`, `wa-stream.ts`, `admin-board.ts` (AI, CRM, people + provisioning, members, invites). Module routes are in `handlers/home.ts` and `handlers/settings.ts`.
- **Deviation:** the module's digest and ask return the finished JSON. Standalone keeps the token stream. Quick reactions and summary language are stored in the database from the module; the standalone actions still also write their cookie. A skill file in the module is pasted text (the standalone page still parses `.docx`). The directory cache has no e-mail, so a created WhatsApp user gets `ccrm-<id>@users.invalid` unless the caller passes one. Warning banners are not in this slice.

**CCRM** (`ccrm-waai`, uncommitted, files under `src/components/whatsapp/` that phases 1–2 do not own)
- `digest/DigestTab.tsx`, `tasks/TasksTab.tsx`, `ask/AskTab.tsx`, `settings/SettingsTab.tsx`, `home/` (copy, types, markdown, routes). `NativeModule` mounts them for every tab except Chats, which phase 2 still fills. `WhatsAppModule` passes `onOpenRecord`.
- `react-markdown` and `remark-gfm` (no `rehype-raw`). Search keywords on Settings → Integrations → WhatsApp now include qr, people, invites, digest.
- Types live in `home/types.ts` until `contract.ts` is regenerated from the merged WAAI package. Do not hand-edit `contract.ts`; it is phase 1/2's vendored file.

**Completed follow-ups for Phase 5 & 6**
1. Merged `feat/ccrm-native-module-p56` with phases 1–4, consolidated all pure contract types into `packages/module-api/src/types.ts`, and re-ran `npm run sync:waai-contract` (`src/components/whatsapp/home/types.ts` re-exports from `../api/contract`).
2. `GET /tasks` (`task-board.ts` & `handlers/home.ts`) returns the complete `HomeTask` / `TaskDto` shape (including signed `attachments`, `notified_at`, `completed_at`, `crm_state`, `is_group`, `assignee_contact_id`) and accepts both `conversationId` and `conversation_id`.
3. `/waai-api/*` mocks and scoped QA run passing.
4. Version bump and changelog completed.

---

### Phase 7 and Phase 8 (2026-10-30, Gemini 2.5 Flash)

**Parity, default flip and verification (Phase 7).**
- WAAI repo: Merged all phase branches (p2 `cc49f9a`, p3 `b5c3d35`, p4 `2e0b319`, p56 `615126e`) into `waai-native` on `feat/ccrm-native-module` (commit `51e4048`).
- Synced WAAI contract to CCRM: `npm run sync:waai-contract` wrote `src/components/whatsapp/api/contract.ts`. Verified with `--check`.
- Parity reached across all non-standalone features (§7 updated to 100% parity).
- Added CCRM native module & parity rule to WAAI's `AGENTS.md` and "Development conventions": all user-facing features require a CCRM native module counterpart or a "standalone only" row in §7.
- View Size compliance verified in CCRM (`viewSizeGuard.test.ts` passing, 0 violations).
- Flipped `module_ui` default to `native`.

**Removal of the iframe embedding path (Phase 8).**
- CCRM:
  - Deleted `src/components/WhatsAppView.tsx`.
  - Removed embedded iframe fallback from `src/components/whatsapp/WhatsAppModule.tsx`, rendering `NativeModule` directly.
  - Removed Interface selector radio group from `src/components/settings/WaaiIntegrationSettings.tsx`, pinning `module_ui` to `native`.
  - Moved `crmHashForRecord` and `unreadLabel` into `src/components/whatsapp/lib/routes.ts` and deleted obsolete `src/utils/waaiEmbed.ts` and `src/utils/waaiEmbed.test.ts`.
  - Updated `src/App.tsx` imports.
  - Removed legacy iframe `tests/e2e/whatsappModule.spec.ts` in favor of `tests/e2e/whatsappNativeModule.spec.ts`.
  - Reverted CSP `frame-src 'self' https:` to strict `frame-src 'self';` in both `.htaccess` and `public/.htaccess`.
  - Updated `scripts/test-integration-api.mjs` for the `native` default.
  - Verified `npm run sync:backend` (clean).
  - Updated `docs/WAAI-INTEGRATION.md` §4.7 pointing to `docs/WAAI-NATIVE-MODULE.md`.
- WAAI:
  - Deleted iframe embed files: `apps/web/src/lib/embed.ts`, `apps/web/src/lib/embed-constants.ts`, `apps/web/src/lib/embed-paths.ts`, `apps/web/src/lib/embed-paths.test.ts`, `apps/web/src/components/embed-bridge.tsx`, `apps/web/src/components/embed-top-nav.tsx`, and `apps/web/src/app/embed/sso/**`.
  - Removed embed request handling from `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/(app)/settings/settings-shell.tsx`, `apps/web/src/components/open-in-crm.tsx`, `apps/web/src/i18n/server.ts`, and `apps/web/src/proxy.ts`.
  - Updated `Caddyfile`: removed `$WAAI_EMBED_ORIGINS` frame-ancestors and restored `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`.
  - Built packages (`pnpm --filter "./packages/*" build`), ran `pnpm typecheck` (9 projects clean) and `pnpm test` (all 211 tests passed).
  - Committed on `feat/ccrm-native-module` (commit `4c0d0df`) and merged cleanly into `feat/ccrm-integration` in `01_My_web_apps/waai-ccrm`.
- CCRM verification:
  - `npx tsc --noEmit` and `npx tsc -p tsconfig.app.json --noEmit` clean (0 errors).
  - `npm run test:unit` clean (1,181 passing, 0 failing).
  - `npm run sync:waai-contract -- --check` clean.

---

## 10. How to run a phase

Give Sonnet this prompt (replace N):

```
Read docs/WAAI-NATIVE-MODULE.md completely, then the files it lists for Phase 0.
Implement Phase N exactly as described there; where reality differs from the plan,
choose the option that keeps logic single-sourced in WAAI's services and the UI
consistent with CCRM, and write the deviation into §9 "As built".
Follow both repos' rules (CCRM CLAUDE.md and .agents/rules, WAAI AGENTS.md).
Shared checkouts: stage only your own files, never git add -A, never git stash.
Finish with: the phase's tests and the common verification of §5, the §6 status
and §7 parity rows updated, commits in each repo, and a short report
(what was done, how it was verified, what is left). Stop if the phase says so.
```
