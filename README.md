# Still Good? — Cookidoo Freshness Tracker

Tracks your Cookidoo recently cooked list and calculates best-before dates so you know what's safe in your fridge or freezer.

## How it works

- A GitHub Actions workflow authenticates with your Cookidoo account via OAuth and scrapes your cooking history
- Recipe names + cook timestamps are parsed from the server-rendered HTML
- Results are committed to `data/cook-history.json` and served via GitHub Pages
- Best-before dates are calculated per dish category (fridge and freezer)
- User preferences (fridge/freezer choice, eaten status, custom expiry) are stored in your browser's localStorage

## Setup

### 1. Fork or clone this repo and push to GitHub

Make sure `feature/cloudflare-github-pages` is set as the default branch:
**Settings → General → Default branch**

### 2. Enable GitHub Pages

**Settings → Pages → Source → GitHub Actions**

Also allow the branch in environment protection rules if prompted:
**Settings → Environments → github-pages → Deployment branches → Add rule → `feature/cloudflare-github-pages`**

### 3. Add your Cookidoo credentials as repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `COOKIDOO_EMAIL` | Your Cookidoo login email |
| `COOKIDOO_PASSWORD` | Your Cookidoo password |

### 4. Run the first scrape

**Actions tab → Scrape Cookidoo → Run workflow**

This will scrape your cooking history, commit the data, and trigger a Pages deployment. The live site will show your recipes once both workflows complete (~1–2 minutes).

### 5. Connect the Sync button (optional but recommended)

The **↻ Sync Cookidoo** button in the app can trigger a live scrape directly. It needs a GitHub personal access token stored in your browser:

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. Repository access: **Only select repositories → cookidoo-freshness**
3. Permission: **Actions → Read and write** (nothing else needed)
4. Copy the token
5. Click **↻ Sync Cookidoo** in the app — a one-time prompt will ask you to paste it

The token is saved to your browser's localStorage only. It is never committed or sent anywhere except GitHub's API.

## Syncing

- **Automatic**: every 6 hours via scheduled GitHub Actions
- **Manual from app**: click **↻ Sync Cookidoo** (requires the one-time token setup above)
- **Manual from GitHub**: Actions tab → Scrape Cookidoo → Run workflow

## Local development

```bash
npm install
COOKIDOO_EMAIL=you@example.com COOKIDOO_PASSWORD=yourpassword node scripts/scrape.js
# Then open index.html in a browser — it reads ./data/cook-history.json
```

## Branches

| Branch | Description |
|---|---|
| `feature/cloudflare-github-pages` | Current — GitHub Pages + GitHub Actions |
| `main` | Old — Netlify + cookie auth |
| `feature/option-b-python-auth` | Old — Netlify + OAuth |
