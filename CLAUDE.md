# Cookidoo Freshness Tracker — Project Context

## What this project does
A web app that scrapes the user's Cookidoo "Recently Cooked" list and tracks food freshness/best-before dates. It shows recipe cards with fridge/freezer toggles, an "Eaten" checkbox, and auto-calculates expiry dates by food category. Auto-syncs on every page load.

## Owner
- GitHub: https://github.com/haansplosion/cookidoo-freshness
- Branches: `main` (stable cookie-based auth), `feature/option-b-python-auth` (OAuth auth — current working branch)

## Tech stack
- Frontend: Vanilla HTML/CSS/JS (`index.html`) — no framework
- Backend: Netlify Functions (Node.js)
- Storage: Netlify Blobs
- Hosting: Netlify (also used via `netlify dev` for local development)

## Project location
`~/Library/Mobile Documents/com~apple~CloudDocs/Development/Claude Projects/cookidoo-freshness/`

## File structure
```
index.html                        # Full frontend app
netlify.toml                      # Netlify config
netlify/functions/
  auth.js                         # OAuth token exchange via Vorwerk login endpoint
  scrape.js                       # Fetches Cookidoo cooking history HTML, parses recipes
  storage.js                      # Netlify Blobs read/write wrapper
  package.json                    # @netlify/blobs, node-html-parser
.env                              # Local secrets — gitignored
.env.example                      # Safe template — committed to git
.gitignore                        # Blocks .env, node_modules, .netlify/, .DS_Store
CLAUDE.md                         # This file
README.md                         # Setup instructions
```

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `NETLIFY_PAT` | `.env` + Netlify site settings | Netlify Blobs auth |
| `COOKIDOO_EMAIL` | `.env` + Netlify site settings | Cookidoo login email for OAuth |
| `COOKIDOO_PASSWORD` | `.env` + Netlify site settings | Cookidoo login password for OAuth |
| `SITE_ID` | Auto-injected by Netlify | No action needed |

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
```bash
cd netlify/functions && npm install && cd ../..
netlify dev
# Opens at http://localhost:8888
# .env is auto-read by netlify dev — no extra setup needed
```

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

## Current status
- `feature/option-b-python-auth` is the active development branch — OAuth working locally
- OAuth token uses `eu.login.vorwerk.com/oauth2/token` with `market=au` param
- Bearer token auth against the web HTML endpoint is **unverified in production** — may need testing when deployed
- `main` branch retains the older cookie-based approach as a stable fallback if needed
- No cookie references remain anywhere in the Option B codebase (UI or functions)

## What's pending / next steps
- Test OAuth Bearer token against live Cookidoo endpoint (deploy to Netlify to verify)
- If Bearer token works on web endpoint → merge feature branch to main
- If Bearer token fails on web endpoint → investigate hybrid approach (OAuth login + cookie extraction)
- Consider setting up GitHub Actions for auto-deploy on push to main
