# Cookidoo Freshness Tracker — Project Context

## What this project does
A web app that scrapes the user's Cookidoo "Recently Cooked" list and tracks food freshness/best-before dates. It shows recipe cards with fridge/freezer toggles, an "Eaten" checkbox, and auto-calculates expiry dates by food category. Auto-syncs on every page load.

## Owner
- GitHub: https://github.com/haansplosion/cookidoo-freshness
- Branches:
  - `main` — stable, cookie-based auth, Netlify hosting
  - `feature/option-b-python-auth` — OAuth via Vorwerk login, Netlify hosting (current production branch)
  - `feature/cloudflare-github-pages` — OAuth auth, **Cloudflare Workers + KV backend**, GitHub Pages frontend

## Tech stack
- Frontend: Vanilla HTML/CSS/JS (`index.html`) — no framework
- Backend: Netlify Functions (Node.js)
- Storage: Netlify Blobs
- Hosting: Netlify (also used via `netlify dev` for local development)

## Project location
`~/Library/Mobile Documents/com~apple~CloudDocs/Development/Claude Projects/cookidoo-freshness/`

## File structure
```
index.html                        # Full frontend app (served by Netlify OR GitHub Pages)
netlify.toml                      # Netlify config (feature/option-b-python-auth + main)
netlify/functions/
  auth.js                         # OAuth token exchange via Vorwerk login endpoint (Netlify)
  scrape.js                       # Fetches Cookidoo cooking history HTML, parses recipes (Netlify)
  storage.js                      # Netlify Blobs read/write wrapper (Netlify)
  package.json                    # @netlify/blobs, node-html-parser
workers/                          # Cloudflare Workers (feature/cloudflare-github-pages only)
  index.js                        # Router — maps /auth, /scrape, /storage to handlers
  auth.js                         # OAuth token exchange via Vorwerk login endpoint (CF)
  scrape.js                       # Fetches Cookidoo cooking history HTML, parses recipes (CF)
  storage.js                      # Cloudflare KV read/write wrapper (CF)
wrangler.toml                     # Cloudflare Workers config + KV binding
.dev.vars                         # Local CF secrets — gitignored (COOKIDOO_EMAIL, COOKIDOO_PASSWORD)
.dev.vars.example                 # Safe template — committed to git
.github/workflows/deploy.yml      # GitHub Actions: deploys index.html to GitHub Pages on push
.env                              # Local Netlify secrets — gitignored
.env.example                      # Safe template — committed to git
.gitignore                        # Blocks .env, .dev.vars, node_modules, .netlify/, .DS_Store
CLAUDE.md                         # This file
README.md                         # Setup instructions
package.json                      # Root deps: node-html-parser (used by Cloudflare Workers build)
```

## Environment variables

### Netlify branches (main, feature/option-b-python-auth)
| Variable | Where | Purpose |
|---|---|---|
| `NETLIFY_PAT` | `.env` + Netlify site settings | Netlify Blobs auth |
| `COOKIDOO_EMAIL` | `.env` + Netlify site settings | Cookidoo login email for OAuth |
| `COOKIDOO_PASSWORD` | `.env` + Netlify site settings | Cookidoo login password for OAuth |
| `SITE_ID` | Auto-injected by Netlify | No action needed |

### Cloudflare branch (feature/cloudflare-github-pages)
| Variable | Where | Purpose |
|---|---|---|
| `COOKIDOO_EMAIL` | `.dev.vars` (local) + CF dashboard (prod) | Cookidoo login email for OAuth |
| `COOKIDOO_PASSWORD` | `.dev.vars` (local) + CF dashboard (prod) | Cookidoo login password for OAuth |

`NETLIFY_PAT` and `SITE_ID` are **not needed** — Cloudflare KV is accessed via the `COOKIDOO_KV` binding, no token required.

**Note:** Cookie-based auth has been fully removed. OAuth is the only auth method.

## How authentication works
1. On first run (or if no token exists), the app auto-pops a clean sign-in modal
2. User enters Cookidoo email + password
3. `auth.js` POSTs credentials to `eu.login.vorwerk.com/oauth2/token` (Vorwerk OAuth endpoint, same as Android app)
4. Access token + refresh token are stored in Netlify Blobs (`oauthToken` key)
5. On subsequent syncs, `scrape.js` reads the token from Blobs and auto-refreshes if expired
6. Locally, `COOKIDOO_EMAIL` + `COOKIDOO_PASSWORD` in `.env` means the token is obtained automatically on first `netlify dev` run — sign-in modal won't appear

**Sign-in modal behaviour:**
- Auto-opens if `scrape.js` returns `no_auth` or `401`
- Not dismissable by clicking outside (intentional — app is unusable without auth)
- Enter key submits the form
- Errors display inline in the modal

## How scraping works
- `scrape.js` fetches `/organize/en-AU/cooking-history` server-side using the OAuth Bearer token
- The response is server-rendered HTML containing `<core-tile>` elements
- Each tile has `data-recipe-id` and `<organize-date-replacer iso-date="...">` — parsed for recipe name + cook timestamp
- Pagination: `<organize-paged-content stop-after="N">` → pages fetched as `?page=2`, `?page=3` etc (max 10)
- Results saved to Netlify Blobs as `cookHistory`

## Netlify Blobs setup (critical conventions)
- Store name: `cookidoo-freshness-store`
- Always use: `getStore({ name, siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT })`
- `@netlify/blobs` MUST be in `netlify/functions/package.json`, NOT root `package.json`
- Deploy via CLI only: `netlify deploy --prod` — not via Netlify Drop
- `NETLIFY_PAT` must be set in Netlify site env vars for deployed functions
- Blob keys in use: `oauthToken`, `cookHistory`, `bestBefore`

## Local dev

### Netlify (main / feature/option-b-python-auth)
```bash
cd netlify/functions && npm install && cd ../..
netlify dev
# Opens at http://localhost:8888
# .env is auto-read by netlify dev — no extra setup needed
```

### Cloudflare Workers (feature/cloudflare-github-pages)
```bash
npm install                        # installs node-html-parser for wrangler bundling
cp .dev.vars.example .dev.vars     # fill in COOKIDOO_EMAIL and COOKIDOO_PASSWORD
npx wrangler dev                   # starts worker on http://localhost:8787
# Open index.html directly in a browser (file://) or: npx serve .
```

Before deploying to Cloudflare production:
1. Create a KV namespace: `npx wrangler kv namespace create COOKIDOO_KV`
2. Paste the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`
3. Set secrets: `npx wrangler secret put COOKIDOO_EMAIL` and `npx wrangler secret put COOKIDOO_PASSWORD`
4. Deploy: `npx wrangler deploy`

## Git workflow (safe — token never in chat)
```bash
export GH_TOKEN=your_token_here   # Set in terminal only, never paste in chat
git remote set-url origin https://$GH_TOKEN@github.com/haansplosion/cookidoo-freshness.git
git checkout feature/option-b-python-auth   # or main
git add .
git commit -m "your message"
git push
```

## UI overview

### Cards
- Recipe image (160px, full width)
- Title: Fraunces serif, max 2 lines (`-webkit-line-clamp: 2`), anchored to top
- Flexible spacer pushes bottom section down
- **Bottom section (all anchored to bottom):**
  - Cook date (left) + Eaten checkbox (right) — same row
  - Freshness badge (left) + Fridge/Freezer toggle (right) — same row
- Card click → opens expiry editor modal
- Fridge/Freezer toggle → instantly recalculates expiry, saves to Blobs
- Eaten checkbox → dims card to 50% opacity, shows "Eaten" badge

### Freshness badge
- Font size 12px (matches storage toggle text)
- Safe (green), Caution (amber), Expired (red), Eaten (muted)
- Label format: "3d left", "Eat today!", "Exp 2d ago"

### Modals
1. **Sign-in modal** — first run / auth expired, not dismissable by clicking outside
2. **Settings modal** — update email/password, adjust shelf life defaults per category
3. **Expiry editor** — override days count or set specific use-by date (opened by clicking a card)

### Header
- "Still Good?" logo
- "↻ Sync Cookidoo" button (manual refresh, also auto-runs on page load)
- ⚙ settings button

### Status bar
- Left: status dot + last sync time + auth method (🔑 OAuth)
- Right: filter tabs (All / ✓ Fresh / ⚠ Use Soon / ✕ Expired)

## Food category shelf life defaults
| Category | Fridge (days) | Freezer (days) |
|---|---|---|
| Meat / Poultry | 3 | 90 |
| Fish / Seafood | 2 | 60 |
| Rice / Pasta | 4 | 60 |
| Soup / Stock | 4 | 90 |
| Dairy / Eggs | 3 | 30 |
| Vegetables | 5 | 90 |
| Other | 3 | 60 |

Category is detected by keyword matching against recipe name (lowercase).

## Cloudflare Workers architecture (feature/cloudflare-github-pages)

### How the single worker handles routing
`workers/index.js` is the entry point (`main` in `wrangler.toml`). It routes:
- `GET/POST /auth` → `workers/auth.js` — login, token refresh, auth status check
- `GET /scrape` → `workers/scrape.js` — scrapes Cookidoo, saves to KV, returns recipes
- `GET/POST /storage?action=...&key=...` — KV ping/get/set (same API surface as Netlify version)

All CORS headers are set on every response. OPTIONS preflight is handled in the router.

### KV keys used
Same as Netlify Blobs: `oauthToken`, `cookHistory`, `bestBefore`

### GitHub Pages
`index.html` is served directly from the repo root via GitHub Actions (`.github/workflows/deploy.yml`).
Deploys automatically on every push to `feature/cloudflare-github-pages`.
The `API_BASE` constant in `index.html` switches automatically between local (`localhost:8787`) and production (`cookidoo-freshness.workers.dev`) based on `window.location.hostname`.

## Current status
- `feature/option-b-python-auth` — OAuth working, deployed to Netlify production (`cookidoo-freshness.netlify.app`)
- `feature/cloudflare-github-pages` — Cloudflare Workers port complete, wrangler dev verified locally
- `main` — stable cookie-based auth on Netlify (kept as fallback)

## What's pending / next steps
- Test OAuth Bearer token against live Cookidoo endpoint on Cloudflare deploy
- Create KV namespace in Cloudflare dashboard and update `wrangler.toml` with real ID
- Enable GitHub Pages in repo settings (source: GitHub Actions) for the CF branch
- If Bearer token works → consider making CF branch the primary
