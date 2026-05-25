'use strict';

const { parse } = require('node-html-parser');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const HISTORY_URL = 'https://cookidoo.com.au/organize/en-AU/cooking-history';

async function getAuthCookies(email, password) {
  console.log('Launching headless browser for authentication...');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`Navigating to ${HISTORY_URL}`);
    await page.goto(HISTORY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const afterNavUrl = page.url();
    console.log(`After navigation: ${afterNavUrl}`);

    if (!afterNavUrl.includes('/cooking-history')) {
      console.log('Redirected to auth page, filling credentials...');

      // Wait for email/username input
      await page.waitForSelector(
        'input[type="email"], input[name="email"], input[name="username"], input[id*="email"]',
        { timeout: 20000, visible: true }
      );

      const emailInput =
        (await page.$('input[type="email"]')) ||
        (await page.$('input[name="email"]')) ||
        (await page.$('input[name="username"]'));

      if (!emailInput) throw new Error('Cannot find email/username input on login page');
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email);
      console.log('Filled email');

      // Check if password is on same page or requires a separate step
      let passwordInput = await page.$('input[type="password"]');

      if (!passwordInput) {
        // Multi-step login: submit email first
        console.log('Multi-step login: submitting email...');
        const nextBtn = await page.$('button[type="submit"], [type="submit"]');
        if (!nextBtn) throw new Error('Cannot find next button after email');
        await nextBtn.click();
        await page.waitForSelector('input[type="password"]', { visible: true, timeout: 20000 });
        passwordInput = await page.$('input[type="password"]');
      }

      if (!passwordInput) throw new Error('Cannot find password input');
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(password);
      console.log('Filled password');

      const submitBtn = await page.$('button[type="submit"], [type="submit"]');
      if (!submitBtn) throw new Error('Cannot find submit button');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        submitBtn.click(),
      ]);

      const afterLoginUrl = page.url();
      console.log(`After login: ${afterLoginUrl}`);

      // Navigate to history if we landed somewhere else (e.g. home page)
      if (!afterLoginUrl.includes('/cooking-history')) {
        console.log('Navigating to cooking history post-login...');
        await page.goto(HISTORY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`Final URL: ${page.url()}`);
      }
    }

    const cookies = await page.cookies();
    console.log(`Got ${cookies.length} cookies`);
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } finally {
    await browser.close();
  }
}

async function fetchPage(cookieHeader, pageNum) {
  const url = HISTORY_URL + (pageNum > 1 ? '?page=' + pageNum : '');
  console.log(`Fetching page ${pageNum}: ${url}`);

  const res = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'cookie': cookieHeader,
    },
  });

  const finalUrl = res.url !== url ? ` (redirected to ${res.url})` : '';
  console.log(`  → ${res.status} ${res.statusText}${finalUrl}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(`  Response body (first 500 chars): ${body.slice(0, 500)}`);
    throw new Error(`HTTP ${res.status} fetching page ${pageNum}`);
  }
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

async function scrapeAll(cookieHeader) {
  const html1 = await fetchPage(cookieHeader, 1);
  const { recipes: page1, totalPages } = parseRecipes(html1);
  let all = [...page1];

  const maxPages = Math.min(totalPages, 10);
  for (let p = 2; p <= maxPages; p++) {
    try {
      const html = await fetchPage(cookieHeader, p);
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

  console.log('Getting auth cookies via browser...');
  const cookieHeader = await getAuthCookies(email, password);
  console.log('Auth OK. Scraping cooking history...');

  const recipes = await scrapeAll(cookieHeader);
  console.log(`Found ${recipes.length} recipes.`);
  if (recipes.length === 0) {
    console.warn('WARNING: 0 recipes found — cookies may be invalid or history is empty');
  }

  const output = {
    recipes,
    lastSynced: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, '..', 'data', 'cook-history.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => {
  console.error('SCRAPE FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
