const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Vorwerk OAuth endpoint for the Australia region
// Discovered via cookidoo-api library raw request logs + login URL inspection
const TOKEN_URL = 'https://eu.login.vorwerk.com/oauth2/token';

// OAuth client credentials used by the Cookidoo Android app
// These are the same values used by the cookidoo-api library
const CLIENT_ID     = 'technicaluser_public';
const CLIENT_SECRET = '';
const SCOPE         = 'openid offline_access';

async function fetchNewToken(email, password) {
  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username:      email,
    password:      password,
    scope:         SCOPE,
    market:        'au',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + (data.expires_in * 1000),
  };
}

async function refreshToken(storedRefreshToken) {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: storedRefreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);

  const data = await res.json();
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || storedRefreshToken,
    expiresAt:    Date.now() + (data.expires_in * 1000),
  };
}

// Get a valid access token — refreshes automatically if expired, logs in fresh if needed
async function getValidToken(store) {
  const stored = await store.get('oauthToken');
  if (stored) {
    const token = JSON.parse(stored);
    // If not expired (with 60s buffer), return as-is
    if (token.expiresAt > Date.now() + 60000) {
      return token.accessToken;
    }
    // Try refresh first
    if (token.refreshToken) {
      try {
        const refreshed = await refreshToken(token.refreshToken);
        await store.set('oauthToken', JSON.stringify(refreshed));
        return refreshed.accessToken;
      } catch(e) {
        console.warn('Token refresh failed, will re-login:', e.message);
      }
    }
  }

  // Full re-login using credentials from env vars
  const email    = process.env.COOKIDOO_EMAIL;
  const password = process.env.COOKIDOO_PASSWORD;

  if (!email || !password) {
    throw new Error('no_credentials');
  }

  const newToken = await fetchNewToken(email, password);
  await store.set('oauthToken', JSON.stringify(newToken));
  return newToken.accessToken;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const SITE_ID = process.env.SITE_ID;
  const TOKEN   = process.env.NETLIFY_PAT;

  if (!SITE_ID || !TOKEN) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Netlify Blobs not configured' }) };
  }

  const store = getStore({ name: 'cookidoo-freshness-store', siteID: SITE_ID, token: TOKEN });

  // POST: save credentials and get initial token
  if (event.httpMethod === 'POST') {
    try {
      const { email, password } = JSON.parse(event.body || '{}');
      if (!email || !password) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'email and password required' }) };
      }
      const newToken = await fetchNewToken(email, password);
      await store.set('oauthToken', JSON.stringify(newToken));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, message: 'Logged in successfully' }) };
    } catch(err) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // GET: check whether a valid token exists (does not return the token itself)
  try {
    await getValidToken(store);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, authenticated: true }) };
  } catch(err) {
    if (err.message === 'no_credentials') {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'no_credentials', authenticated: false }) };
    }
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: err.message, authenticated: false }) };
  }
};
