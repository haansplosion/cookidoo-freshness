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

async function fetchPage(accessToken, page) {
  const url = 'https://cookidoo.com.au/organize/en-AU/cooking-history' +
    (page > 1 ? '?page=' + page : '');
  const res = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'x-requested-with': 'xmlhttprequest',
      Authorization: 'Bearer ' + accessToken,
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

async function scrapeAll(accessToken) {
  const html1 = await fetchPage(accessToken, 1);
  const { recipes: page1Recipes, totalPages } = parseRecipes(html1);
  let allRecipes = [...page1Recipes];
  const maxPages = Math.min(totalPages, 10);
  for (let p = 2; p <= maxPages; p++) {
    try {
      const html = await fetchPage(accessToken, p);
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
    let accessToken;
    try {
      accessToken = await getValidToken(kv, env.COOKIDOO_EMAIL, env.COOKIDOO_PASSWORD);
    } catch (err) {
      if (err.message === 'no_credentials') {
        return json({ error: 'no_auth', message: 'No credentials. Sign in via the app.' }, 400);
      }
      throw err;
    }

    const allRecipes = await scrapeAll(accessToken);
    const lastSynced = new Date().toISOString();
    await kv.put('cookHistory', JSON.stringify({ recipes: allRecipes, lastSynced, authMethod: 'oauth' }));

    return json({ ok: true, count: allRecipes.length, recipes: allRecipes, lastSynced, authMethod: 'oauth' });
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('403')) {
      return json({ error: 'auth_expired', message: 'Auth expired. Sign in again.' }, 401);
    }
    return json({ error: err.message }, 500);
  }
}
