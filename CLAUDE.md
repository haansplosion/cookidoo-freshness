# Cookidoo Freshness Tracker — Project Context

## What this project does
A web app that scrapes the user's Cookidoo "Recently Cooked" list and tracks food freshness/best-before dates. It shows recipe cards with fridge/freezer toggles, an "Eaten" checkbox, and auto-calculates expiry dates by food category. Auto-syncs on every page load.

## Owner
- GitHub: https://github.com/haansplosion/cookidoo-freshness
- This branch: `feature/cloudflare-github-pages`
- Other branches: `main` (old Netlify cookie auth), `feature/option-b-python-auth` (Netlify OAuth)

## Tech stack
- Frontend: Vanilla HTML/CSS/JS (`index.html`) — no framework, served via GitHub Pages
- Backend: Cloudflare Workers (3 handlers behind a single worker router)
- Storage: Cloudflare KV (binding name: `COOKIDOO_KV`)
- Hosting: GitHub Pages (frontend) + Cloudflare Workers (backend)

## Project location
`~/Library/Mobile Documents/com~apple~CloudDocs/Development/Claude Projects/cookidoo-freshness/`

## File structure
```
index.html                        # Full frontend app — served by GitHub Pages
workers/
  index.js                        # Worker entry point — routes /auth /scrape /storage
  auth.js                         # OAuth token exchange + refresh via Vorwerk login
  scrape.js                       # Fetches Cookidoo cooking history HTML, parses recipes
  storage.js                      # Cloudflare KV ping/get/set wrapper
wrangler.toml                     # Cloudflare Workers config + KV namespace binding
.dev.vars                         # Local dev secrets — gitignored
.dev.vars.example                 # Safe template — committed to git
.github/workflows/deploy.yml      # GitHub Actions: auto-deploys index.html to GitHub Pages
.gitignore
CLAUDE.md                         # This file
README.md
package.json                      # node-html-parser (runtime) + wrangler (dev)
```

## Environment variables
| Variable | Local (`.dev.vars`) | Production |
|---|---|---|
| `COOKIDOO_EMAIL` | Set manually | Cloudflare dashboard → Workers → Settings → Variables |
| `COOKIDOO_PASSWORD` | Set manually | Cloudflare dashboard → Workers → Settings → Variables |

No `NETLIFY_PAT` or `SITE_ID` needed — KV is accessed via the `COOKIDOO_KV` binding, no token required.

## How authentication works
1. On first run (or if no token exists), the app auto-pops a sign-in modal
2. User enters Cookidoo email + password
3. `workers/auth.js` POSTs credentials to `au.tmmobile.vorwerk-digital.com/ciam/auth/token` (Vorwerk mobile CIAM — source: miaucl/cookidoo-api)
4. Access token + refresh token are stored in Cloudflare KV under key `oauthToken`
5. On subsequent syncs, `workers/scrape.js` calls `getValidToken()` which auto-refreshes if expired
6. If `COOKIDOO_EMAIL`/`COOKIDOO_PASSWORD` are set in `.dev.vars`, the token is obtained automatically — sign-in modal won't appear

**Sign-in modal behaviour:**
- Auto-opens if scrape returns `no_auth` or `401`
- Not dismissable by clicking outside (intentional — app is unusable without auth)
- Enter key submits the form
- Errors display inline in the modal

## How scraping works
- `workers/scrape.js` fetches `/organize/en-AU/cooking-history` server-side using OAuth Bearer token
- The response is server-rendered HTML containing `<core-tile>` elements
- Each tile has `data-recipe-id` and `<organize-date-replacer iso-date="...">` — parsed for recipe name + cook timestamp
- Pagination: `<organize-paged-content stop-after="N">` → pages fetched as `?page=2`, `?page=3` etc (max 10)
- Results saved to KV as `cookHistory`
- If OAuth fails, `scrape.js` falls back to a session cookie stored in KV (`cookieString` key) or `env.COOKIDOO_COOKIE`

## Cloudflare Workers architecture

### Routing
`workers/index.js` is the single entry point (set as `main` in `wrangler.toml`). It routes:
- `GET/POST /auth` → `workers/auth.js` — login, token refresh, auth status check
- `GET /scrape` → `workers/scrape.js` — scrapes Cookidoo, saves to KV, returns recipes
- `GET/POST /storage?action=...&key=...` → `workers/storage.js` — KV ping/get/set

All CORS headers are set on every response. OPTIONS preflight is handled at the router level.

### KV keys
`oauthToken`, `cookHistory`, `bestBefore`

### API_BASE in index.html
The `API_BASE` constant at the top of the `<script>` block auto-selects:
- `http://localhost:8787` when running locally
- `https://cookidoo-freshness.workers.dev` in production (update with your actual subdomain after first deploy)

## Local dev
```bash
npm install                        # installs node-html-parser + wrangler
cp .dev.vars.example .dev.vars     # then fill in COOKIDOO_EMAIL and COOKIDOO_PASSWORD
npx wrangler dev                   # starts worker on http://localhost:8787
# Open index.html in a browser (file://) or: npx serve .
```

## Deploying to production

### First-time setup
```bash
# 1. Create the KV namespace
npx wrangler kv namespace create COOKIDOO_KV
# → copy the returned id into wrangler.toml [[kv_namespaces]] id field

# 2. Set production secrets
npx wrangler secret put COOKIDOO_EMAIL
npx wrangler secret put COOKIDOO_PASSWORD

# 3. Deploy the worker
npx wrangler deploy
# → note the workers.dev URL and update API_BASE in index.html
```

### GitHub Pages
Push to this branch — GitHub Actions (`.github/workflows/deploy.yml`) deploys `index.html` automatically.
Enable Pages in repo settings: **Settings → Pages → Source → GitHub Actions**.

## Git workflow (safe — token never in chat)
```bash
export GH_TOKEN=your_token_here   # Set in terminal only, never paste in chat
git remote set-url origin https://$GH_TOKEN@github.com/haansplosion/cookidoo-freshness.git
git checkout feature/cloudflare-github-pages
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
- Fridge/Freezer toggle → instantly recalculates expiry, saves to KV
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

## Current status
- Worker starts cleanly with `wrangler dev` — verified locally
- Bearer token auth against live Cookidoo endpoint is **unverified in production** — test after first `wrangler deploy`

## What's pending / next steps
- Verify OAuth login works end-to-end with real Cookidoo credentials via deployed worker
- Monitor KV token expiry / refresh cycle in production
