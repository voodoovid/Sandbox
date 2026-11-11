// AC relay v0.1 — forwards browser calls from the AC app to Sensibo.
// Stores nothing. The API key arrives in the X-Api-Key header and is passed on to Sensibo only.
const ALLOWED_ORIGIN = 'https://voodoovid.github.io';
const VERSION = 'v0.1';

// Only these upstream services are reachable. Add FGLair and Airstage here later.
const UPSTREAMS = {
  sensibo: {
    host: 'https://home.sensibo.com',
    // /sensibo/<rest> -> https://home.sensibo.com/api/v2/<rest>
    build(rest, key) {
      if (!/^(users\/me\/pods|pods\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_\/-]*)?)$/.test(rest)) return null;
      return { path: '/api/v2/' + rest, key };
    },
  },
};

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? cors(origin) : {}) } });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Health check: open the worker address in a browser to confirm it is running.
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(`AC relay ${VERSION} is running.`, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }

    if (origin !== ALLOWED_ORIGIN) return json({ error: 'Origin not allowed' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const [, service, ...restParts] = url.pathname.split('/');
    const up = UPSTREAMS[service];
    if (!up) return json({ error: 'Unknown service' }, 404, origin);

    const key = request.headers.get('X-Api-Key');
    if (!key) return json({ error: 'Missing X-Api-Key header' }, 401, origin);

    const target = up.build(restParts.join('/'), key);
    if (!target) return json({ error: 'Path not allowed' }, 403, origin);

    const upstreamUrl = new URL(up.host + target.path);
    for (const [k, v] of url.searchParams) if (k.toLowerCase() !== 'apikey') upstreamUrl.searchParams.set(k, v);
    upstreamUrl.searchParams.set('apiKey', target.key);

    const init = { method: request.method, headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' } };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.text();

    let res;
    try { res = await fetch(upstreamUrl.toString(), init); }
    catch { return json({ error: 'Could not reach Sensibo' }, 502, origin); }

    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store', ...cors(origin) },
    });
  },
};
