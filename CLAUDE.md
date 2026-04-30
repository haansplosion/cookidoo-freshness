# Cookidoo Freshness Tracker — Project Context

## What this project does
A web app that scrapes the user's Cookidoo "Recently Cooked" list and tracks food freshness/best-before dates. It shows recipe cards with fridge/freezer toggles, an "Eaten" checkbox, and auto-calculates expiry dates by food category.

## Owner
- GitHub: https://github.com/haansplosion/cookidoo-freshness
- This branch: `feature/cloudflare-github-pages`
- Other branches: `main` (old Netlify cookie auth), `feature/option-b-python-auth` (Netlify OAuth)

## Tech stack
- Frontend: Vanilla HTML/CSS/JS (`index.html`) — no framework, served via GitHub Pages
- Scraping: GitHub Actions workflow (scheduled + manual trigger)
- Storage: `data/cook-history.json` (committed to repo, served by GitHub Pages) + `localStorage` for user preferences
- Hosting: GitHub Pages only — no backend service

## Project location
`~/Library/Mobile Documents/com~apple~CloudDocs/Development/Claude Projects/cookidoo-freshness/`

## File structure
```
index.html                        # Full frontend app — served by GitHub Pages
scripts/
  scrape.js                       # Node.js script: OAuth → scrape → writes data/cook-history.json
data/
  cook-history.json               # Committed scrape output — read directly by index.html
.github/workflows/
  deploy.yml                      # Auto-deploys index.html to GitHub Pages on push
  scrape.yml                      # Runs scrape.js on schedule (every 6h) + workflow_dispatch
package.json                      # node-html-parser dependency
.gitignore
CLAUDE.md                         # This file
README.md
```

## Environment variables / secrets
| Variable | Where set |
|---|---|
| `COOKIDOO_EMAIL` | GitHub repo → Settings → Secrets → Actions |
| `COOKIDOO_PASSWORD` | GitHub repo → Settings → Secrets → Actions |

No tokens, PATs, or service keys needed beyond these two credentials.

## How authentication works
1. `scripts/scrape.js` runs inside GitHub Actions (Azure infrastructure — not Cloudflare)
2. It POSTs credentials to `au.tmmobile.vorwerk-digital.com/ciam/auth/token` (Vorwerk mobile CIAM)
3. Client credentials: `client_id=kupferwerk-client-nwot`, `client_secret=Ls50ON1woySqs1dCdJge`, via `Authorization: Basic` header
4. The Bearer token is used to fetch `cookidoo.com.au/organize/en-AU/cooking-history`

**Why not Cloudflare Workers?**
The Vorwerk CIAM endpoint is behind Cloudflare Bot Management. Requests from Cloudflare Workers (same network) are rejected with 404 "default backend". GitHub Actions (Azure) reaches it fine.

## How scraping works
- `scripts/scrape.js` fetches `/organize/en-AU/cooking-history` pages using the Bearer token
- The response is server-rendered HTML containing `<core-tile>` elements
- Each tile has `data-recipe-id` and `<organize-date-replacer iso-date="...">` — parsed for recipe name + cook timestamp
- Pagination: `<organize-paged-content stop-after="N">` → pages fetched as `?page=2`, `?page=3` etc (max 10)
- Output written to `data/cook-history.json` and committed back to the repo

## How the frontend works
- `index.html` fetches `./data/cook-history.json` directly (same GitHub Pages domain, no CORS)
- The "↻ Sync Cookidoo" button re-fetches the JSON with a cache-bust query param
- All user preferences (fridge/freezer choice, eaten status, custom expiry) stored in `localStorage`
- Settings modal only shows shelf life defaults (no credentials — those are in GitHub secrets)
- No sign-in modal, no backend API calls

## Triggering a scrape
- **Automatic**: every 6 hours via cron in `scrape.yml`
- **Manual**: GitHub repo → Actions tab → "Scrape Cookidoo" → "Run workflow"
- The `[skip ci]` commit message on the data update prevents deploy.yml from re-triggering

## Local dev
```bash
npm install
# Set env vars, then:
COOKIDOO_EMAIL=you@example.com COOKIDOO_PASSWORD=yourpassword node scripts/scrape.js
# Open index.html in browser — it will try to fetch ./data/cook-history.json
```

## Deploying / setup

### First-time GitHub setup
1. Push this branch to GitHub
2. Go to repo Settings → Pages → Source: GitHub Actions
3. Allow `feature/cloudflare-github-pages` in environment protection rules
4. Add `COOKIDOO_EMAIL` and `COOKIDOO_PASSWORD` to repo Settings → Secrets → Actions
5. Run the "Scrape Cookidoo" workflow manually to populate `data/cook-history.json`

### GitHub Pages
Push to this branch — GitHub Actions (`deploy.yml`) deploys `index.html` automatically.

## Git workflow (safe — token never in chat)
```bash
export GH_TOKEN=your_token_here
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
- **Bottom section:**
  - Cook date (left) + Eaten checkbox (right)
  - Freshness badge (left) + Fridge/Freezer toggle (right)
- Card click → opens expiry editor modal
- Fridge/Freezer toggle → instantly recalculates expiry, saves to localStorage
- Eaten checkbox → dims card to 50% opacity, shows "Eaten" badge

### Freshness badge
- Font size 12px
- Safe (green), Caution (amber), Expired (red), Eaten (muted)
- Label format: "3d left", "Eat today!", "Exp 2d ago"

### Modals
1. **Settings modal** — adjust shelf life defaults per category (no credentials)
2. **Expiry editor** — override days count or set specific use-by date (opened by clicking a card)

### Header
- "Still Good?" logo
- "↻ Sync Cookidoo" button (re-fetches cook-history.json)
- ⚙ settings button

### Status bar
- Left: status dot + last sync time (from `lastSynced` field in the JSON)
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
- GitHub Actions scrape workflow: **untested in production** — run manually after first push
- OAuth from GitHub Actions (Azure IPs) to Vorwerk CIAM: **expected to work** — different from Cloudflare Workers which is blocked
