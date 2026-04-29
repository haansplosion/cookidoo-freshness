const { parse } = require('node-html-parser');
const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Auth priority:
// 1. OAuth access token (from auth.js — email/password via Vorwerk login, preferred)
// 2. Cookie saved via Settings panel in Netlify Blobs
// 3. COOKIDOO_COOKIE environment variable
// Never hardcode credentials in source.

async function fetchPage(authHeader, page) {
  const url = 'https://cookidoo.com.au/organize/en-AU/cooking-history' + (page > 1 ? '?page=' + page : '');
  const res = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'x-requested-with': 'xmlhttprequest',
      ...authHeader,
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching page ' + page);
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
  const stopAfter = pagedContent ? parseInt(pagedContent.getAttribute('stop-after') || '1') : 1;
  return { recipes, totalPages: stopAfter };
}

async function scrapeWithAuth(authHeader) {
  const html1 = await fetchPage(authHeader, 1);
  const { recipes: page1Recipes, totalPages } = parseRecipes(html1);
  let allRecipes = [...page1Recipes];
  const maxPages = Math.min(totalPages, 10);
  for (let p = 2; p <= maxPages; p++) {
    try {
      const html = await fetchPage(authHeader, p);
      const { recipes } = parseRecipes(html);
      allRecipes = allRecipes.concat(recipes);
    } catch(e) {
      console.warn('Failed page ' + p + ':', e.message);
      break;
    }
  }
  const seen = new Set();
  return allRecipes.filter(r => {
    const k = r.recipeId + '-' + r.cookedAt;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const SITE_ID = process.env.SITE_ID;
  const TOKEN   = process.env.NETLIFY_PAT;

  try {
    // Handle POST: save a new cookie string from Settings panel
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (body.cookieString && SITE_ID && TOKEN) {
        const store = getStore({ name: 'cookidoo-freshness-store', siteID: SITE_ID, token: TOKEN });
        await store.set('cookieString', body.cookieString);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, saved: true }) };
      }
    }

    let allRecipes = null;
    let authMethod = 'unknown';

    // Try 1: OAuth token (best — auto-refreshing, no cookie needed)
    if (SITE_ID && TOKEN) {
      try {
        const store = getStore({ name: 'cookidoo-freshness-store', siteID: SITE_ID, token: TOKEN });
        const stored = await store.get('oauthToken');
        if (stored) {
          const tokenData = JSON.parse(stored);
          if (tokenData.expiresAt > Date.now() + 60000) {
            allRecipes = await scrapeWithAuth({ 'Authorization': 'Bearer ' + tokenData.accessToken });
            authMethod = 'oauth';
          }
        }
      } catch(e) {
        console.warn('OAuth attempt failed, falling back to cookie:', e.message);
        allRecipes = null;
      }
    }

    // Try 2: Cookie (fallback)
    if (!allRecipes) {
      let cookieString = process.env.COOKIDOO_COOKIE || null;
      if (SITE_ID && TOKEN) {
        const store = getStore({ name: 'cookidoo-freshness-store', siteID: SITE_ID, token: TOKEN });
        const saved = await store.get('cookieString');
        if (saved) cookieString = saved;
      }
      if (!cookieString) {
        return {
          statusCode: 400, headers: CORS,
          body: JSON.stringify({ error: 'no_auth', message: 'No auth available. Set COOKIDOO_EMAIL + COOKIDOO_PASSWORD or COOKIDOO_COOKIE in env vars.' })
        };
      }
      allRecipes = await scrapeWithAuth({ 'cookie': cookieString });
      authMethod = 'cookie';
    }

    if (SITE_ID && TOKEN) {
      const store = getStore({ name: 'cookidoo-freshness-store', siteID: SITE_ID, token: TOKEN });
      await store.set('cookHistory', JSON.stringify({ recipes: allRecipes, lastSynced: new Date().toISOString(), authMethod }));
    }

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ ok: true, count: allRecipes.length, recipes: allRecipes, lastSynced: new Date().toISOString(), authMethod })
    };

  } catch(err) {
    if (err.message.includes('401') || err.message.includes('403')) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'auth_expired', message: 'Auth expired. Update credentials in Settings.' }) };
    }
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
