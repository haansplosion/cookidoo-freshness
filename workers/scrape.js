import { parse } from 'node-html-parser';
import { getValidToken } from './auth.js';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function fetchPage(authHeader, page) {
  const url = 'https://cookidoo.com.au/organize/en-AU/cooking-history' +
    (page > 1 ? '?page=' + page : '');
  const res = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'x-requested-with': 'xmlhttprequest',
      ...authHeader,
    },
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
  const stopAfter = pagedContent
    ? parseInt(pagedContent.getAttribute('stop-after') || '1')
    : 1;
  return { recipes, totalPages: stopAfter };
}

async function scrapeAll(authHeader) {
  const html1 = await fetchPage(authHeader, 1);
  const { recipes: page1Recipes, totalPages } = parseRecipes(html1);
  let allRecipes = [...page1Recipes];
  const maxPages = Math.min(totalPages, 10);
  for (let p = 2; p <= maxPages; p++) {
    try {
      const html = await fetchPage(authHeader, p);
      const { recipes } = parseRecipes(html);
      allRecipes = allRecipes.concat(recipes);
    } catch (e) {
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

export async function handleScrape(request, env) {
  const kv = env.COOKIDOO_KV;
  try {
    let authHeader;
    let authMethod;

    // Try 1: OAuth Bearer token
    try {
      const accessToken = await getValidToken(kv, env.COOKIDOO_EMAIL, env.COOKIDOO_PASSWORD);
      authHeader = { Authorization: 'Bearer ' + accessToken };
      authMethod = 'oauth';
    } catch (oauthErr) {
      // Try 2: Session cookie from KV, then env var fallback
      const cookieFromKV = await kv.get('cookieString');
      const cookieString = cookieFromKV || env.COOKIDOO_COOKIE || null;
      if (!cookieString) {
        return json({ error: 'no_auth', message: 'No auth available. Add your Cookidoo session cookie in Settings.' }, 400);
      }
      authHeader = { cookie: cookieString };
      authMethod = 'cookie';
    }

    const allRecipes = await scrapeAll(authHeader);
    const lastSynced = new Date().toISOString();
    await kv.put('cookHistory', JSON.stringify({ recipes: allRecipes, lastSynced, authMethod }));

    return json({ ok: true, count: allRecipes.length, recipes: allRecipes, lastSynced, authMethod });
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('403')) {
      return json({ error: 'auth_expired', message: 'Auth expired. Update your cookie in Settings.' }, 401);
    }
    return json({ error: err.message }, 500);
  }
}
