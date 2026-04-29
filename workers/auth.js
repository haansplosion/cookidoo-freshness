const TOKEN_URL = 'https://eu.login.vorwerk.com/oauth2/token';
const CLIENT_ID = 'technicaluser_public';
const CLIENT_SECRET = '';
const SCOPE = 'openid offline_access';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function fetchNewToken(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password,
    scope: SCOPE,
    market: 'au',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function doRefresh(storedRefreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: storedRefreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || storedRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// Exported so scrape.js can reuse without an HTTP round-trip
export async function getValidToken(kv, email, password) {
  const stored = await kv.get('oauthToken');
  if (stored) {
    const token = JSON.parse(stored);
    if (token.expiresAt > Date.now() + 60000) return token.accessToken;
    if (token.refreshToken) {
      try {
        const refreshed = await doRefresh(token.refreshToken);
        await kv.put('oauthToken', JSON.stringify(refreshed));
        return refreshed.accessToken;
      } catch (e) {
        console.warn('Token refresh failed, re-logging in:', e.message);
      }
    }
  }

  if (!email || !password) throw new Error('no_credentials');

  const newToken = await fetchNewToken(email, password);
  await kv.put('oauthToken', JSON.stringify(newToken));
  return newToken.accessToken;
}

export async function handleAuth(request, env) {
  const kv = env.COOKIDOO_KV;

  if (request.method === 'POST') {
    try {
      const { email, password } = await request.json();
      if (!email || !password) return json({ error: 'email and password required' }, 400);
      const newToken = await fetchNewToken(email, password);
      await kv.put('oauthToken', JSON.stringify(newToken));
      return json({ ok: true, message: 'Logged in successfully' });
    } catch (err) {
      return json({ error: err.message }, 401);
    }
  }

  // GET: check auth status — does not return the token itself
  try {
    await getValidToken(kv, env.COOKIDOO_EMAIL, env.COOKIDOO_PASSWORD);
    return json({ ok: true, authenticated: true });
  } catch (err) {
    if (err.message === 'no_credentials') {
      return json({ error: 'no_credentials', authenticated: false }, 400);
    }
    return json({ error: err.message, authenticated: false }, 401);
  }
}
