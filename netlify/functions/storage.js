const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_KEYS = ['cookHistory', 'bestBefore', 'cookieString'];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { action, key } = event.queryStringParameters || {};
  const SITE_ID = process.env.SITE_ID;
  const TOKEN   = process.env.NETLIFY_PAT;

  if (action === 'ping') {
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ has_pat: !!TOKEN, has_site_id: !!SITE_ID })
    };
  }

  if (!SITE_ID || !TOKEN) {
    return {
      statusCode: 503, headers: CORS,
      body: JSON.stringify({
        error: 'Add NETLIFY_PAT environment variable in Netlify site settings',
        has_site_id: !!SITE_ID, has_pat: !!TOKEN,
      })
    };
  }

  if (!VALID_KEYS.includes(key)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid key: ' + key }) };
  }

  try {
    const store = getStore({
      name: 'cookidoo-freshness-store',
      siteID: SITE_ID,
      token: TOKEN,
    });

    if (event.httpMethod === 'GET' && action === 'get') {
      const value = await store.get(key);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ key, value: value ?? null }) };
    }

    if (event.httpMethod === 'POST' && action === 'set') {
      await store.set(key, event.body || '{}');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch(err) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
