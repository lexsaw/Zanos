/* Занос Battle: кэш картинок скинов. Картинка скачивается один раз и потом берётся с телефона/ПК.
   Если основной сервер Steam не отвечает, пробуем запасные. Страницу сайта не кэшируем, чтобы обновления приходили сразу. */
const CACHE = 'zb-img-v1';
const HOSTS = ['community.akamai.steamstatic.com', 'community.cloudflare.steamstatic.com', 'community.fastly.steamstatic.com', 'steamcommunity-a.akamaihd.net'];
const MAX = 2500;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if ((k.startsWith('zb-img-') && k !== CACHE) || (k.startsWith('zb-art-') && k !== 'zb-art-v1')) await caches.delete(k);
  await self.clients.claim();
})()));

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) await cache.delete(k);
}

const NOCORS = {};
async function fromNet(url) {
  const u = new URL(url), path = u.pathname;
  const order = [u.host, ...HOSTS.filter(h => h !== u.host)];
  for (const h of order) {
    if (!NOCORS[h]) {
      try { const r = await fetch('https://' + h + path, { mode: 'cors', credentials: 'omit' }); if (r.ok) return { r, cors: true }; if (r.status === 404) continue; }
      catch (e) { NOCORS[h] = true; }
    }
    // сервер не отдаёт CORS: грузим как обычную картинку, просто без кэша
    try { return { r: await fetch('https://' + h + path, { mode: 'no-cors', credentials: 'omit' }), cors: false }; } catch (e) {}
  }
  return null;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let u; try { u = new URL(req.url); } catch (x) { return; }
  // картинки кейсов с нашего сайта: сразу из кэша, а в фоне проверяем, не обновились ли
  if (u.origin === self.location.origin && /\/case-[\w-]+\.webp$/.test(u.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open('zb-art-v1');
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }
  if (!HOSTS.includes(u.host) || !u.pathname.startsWith('/economy/image/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = 'https://img.zanos/' + u.pathname;
    const hit = await cache.match(key);
    if (hit) return hit;
    const got = await fromNet(req.url);
    if (!got) return Response.error();
    if (got.cors) { try { await cache.put(key, got.r.clone()); if (Math.random() < 0.02) trim(cache); } catch (x) {} }
    return got.r;
  })());
});
