const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

const VALID_KEYS = ['cookHistory', 'bestBefore', 'cookieString'];

export async function handleStorage(request, env) {
  const kv = env.COOKIDOO_KV;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const key = url.searchParams.get('key');

  if (action === 'ping') {
    // KV is always available via binding — no token needed
    return json({ has_pat: true, has_site_id: true });
  }

  if (!VALID_KEYS.includes(key)) {
    return json({ error: 'Invalid key: ' + key }, 400);
  }

  try {
    if (request.method === 'GET' && action === 'get') {
      const value = await kv.get(key);
      return json({ key, value: value ?? null });
    }

    if (request.method === 'POST' && action === 'set') {
      const body = await request.text();
      await kv.put(key, body);
      return json({ ok: true });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (err) {
    return json({ error: err.message }, 503);
  }
}
