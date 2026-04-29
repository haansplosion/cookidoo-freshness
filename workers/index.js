import { handleAuth } from './auth.js';
import { handleScrape } from './scrape.js';
import { handleStorage } from './storage.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 200, headers: CORS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/auth')    return handleAuth(request, env);
    if (pathname === '/scrape')  return handleScrape(request, env);
    if (pathname === '/storage') return handleStorage(request, env);

    return new Response('Not Found', { status: 404 });
  },
};
