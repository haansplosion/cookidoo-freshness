'use strict';

const { parse } = require('node-html-parser');
const fs = require('fs');
const path = require('path');

const TOKEN_URL = 'https://au.tmmobile.vorwerk-digital.com/ciam/auth/token';
const CLIENT_ID = 'kupferwerk-client-nwot';
const CLIENT_SECRET = 'Ls50ON1woySqs1dCdJge';
const AUTH_HEADER = 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');

async function fetchToken(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    username: email,
    password,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': AUTH_HEADER,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function fetchPage(accessToken, page) {
  const url = 'https://cookidoo.com.au/organize/en-AU/cooking-history' +
    (page > 1 ? '?page=' + page : '');

  const res = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'x-requested-with': 'xmlhttprequest',
      'Authorization': 'Bearer ' + accessToken,
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching page ${page}`);
  return res.text();
}

function parseRecipes(html) {
  const root = parse(html);
  const tiles = root.querySelectorAll('core-tile');
  const recipes = [];

  for (const tile of tiles) {
    const recipeId = tile.getAttribute('data-recipe-id');
    if (!recipeId) continue;
    const nameEl = tile.querySelector('.core-tile__description-text');
    const name = nameEl ? nameEl.text.trim().replace(/\n/g, '') : 'Unknown Recipe';
    const dateEl = tile.querySelector('organize-date-replacer');
    const isoDate = dateEl ? dateEl.getAttribute('iso-date') : null;
    const imgEl = tile.querySelector('img.core-tile__image');
    const imgSrc = imgEl ? imgEl.getAttribute('src') : null;
    const linkEl = tile.querySelector('a[href]');
    const href = linkEl ? linkEl.getAttribute('href') : null;
    if (recipeId && isoDate) recipes.push({ recipeId, name, cookedAt: isoDate, imgSrc, href });
  }

  const pagedContent = root.querySelector('organize-paged-content');
  const totalPages = pagedContent
    ? parseInt(pagedContent.getAttribute('stop-after') || '1')
    : 1;

  return { recipes, totalPages };
}

async function scrapeAll(accessToken) {
  const html1 = await fetchPage(accessToken, 1);
  const { recipes: page1, totalPages } = parseRecipes(html1);
  let all = [...page1];

  const maxPages = Math.min(totalPages, 10);
  for (let p = 2; p <= maxPages; p++) {
    try {
      const html = await fetchPage(accessToken, p);
      const { recipes } = parseRecipes(html);
      all = all.concat(recipes);
    } catch (e) {
      console.warn(`Failed page ${p}:`, e.message);
      break;
    }
  }

  const seen = new Set();
  return all.filter(r => {
    const k = r.recipeId + '-' + r.cookedAt;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main() {
  const email = process.env.COOKIDOO_EMAIL;
  const password = process.env.COOKIDOO_PASSWORD;
  if (!email || !password) throw new Error('COOKIDOO_EMAIL and COOKIDOO_PASSWORD must be set');

  console.log('Authenticating with Cookidoo…');
  const tokenData = await fetchToken(email, password);
  console.log('Auth OK. Scraping cooking history…');

  const recipes = await scrapeAll(tokenData.access_token);
  console.log(`Found ${recipes.length} recipes.`);

  const output = {
    recipes,
    lastSynced: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, '..', 'data', 'cook-history.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
