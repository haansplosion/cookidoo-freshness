# Still Good? — Cookidoo Freshness Tracker

Tracks your Cookidoo recently cooked list and calculates best-before dates so you know what's safe in your fridge or freezer.

## How it works

- A Netlify function scrapes your Cookidoo cooking history page using your session cookie
- Recipe names + cook timestamps are parsed from the server-rendered HTML
- Best-before dates are calculated per dish category (fridge and freezer)
- All data is stored in Netlify Blobs — no database needed

## Setup

### 1. Clone and install
```bash
git clone https://github.com/yourusername/cookidoo-freshness.git
cd cookidoo-freshness
cd netlify/functions && npm install && cd ../..
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Fill in your values in `.env` — this file is gitignored and never committed.

### 3. Get your Netlify Personal Access Token
- Go to: https://app.netlify.com/user/applications
- Click **New access token** → name it `cookidoo-freshness` → copy it
- Add it to `.env` as `NETLIFY_PAT`

### 4. Get your Cookidoo session cookie
1. Log into [cookidoo.com.au](https://cookidoo.com.au)
2. Open DevTools (F12) → Network tab → reload the page
3. Find the `cooking-history` HTML document request
4. Click it → Headers → scroll to Request Headers
5. Copy the full `cookie:` value
6. Add it to `.env` as `COOKIDOO_COOKIE`

### 5. Deploy
```bash
netlify login       # first time only
netlify init        # first time only — create new site
netlify deploy --prod
```

### 6. Add environment variables in Netlify
Netlify dashboard → your site → **Site configuration → Environment variables**

Add both:
- `NETLIFY_PAT` — your personal access token from step 3
- `COOKIDOO_COOKIE` — your session cookie from step 4

Then redeploy:
```bash
netlify deploy --prod
```

### 7. Test locally
```bash
netlify dev
```
Open http://localhost:8888 and click **Sync Cookidoo**.

## Updating your cookie

Cookidoo sessions expire periodically (weeks to months). When sync fails:
1. Repeat step 4 above to get a fresh cookie
2. Either paste it in the app via ⚙ Settings (saved to Blobs, no redeploy needed)
3. Or update `COOKIDOO_COOKIE` in Netlify env vars and redeploy

## Branches

- `main` — stable, deployed version
- `feature/option-b-python-auth` — experimental proper OAuth auth via cookidoo-api library

## Environment variables reference

| Variable | Where to set | Description |
|---|---|---|
| `NETLIFY_PAT` | Netlify env vars + `.env` | Personal access token for Blobs auth |
| `COOKIDOO_COOKIE` | Netlify env vars + `.env` | Cookidoo session cookie for scraping |
| `SITE_ID` | Auto-injected by Netlify | No action needed |
