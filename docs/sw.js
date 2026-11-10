// Con Chim Xanh Hub V3.8.4 — iOS / iPadOS Standalone PWA Service Worker
// Provides:
// 1. Offline App Shell caching (index.html, pdf.min.js, pdf.worker.min.js, catalog_data.js, icons)
// 2. HTTP 206 Byte-Range Proxy for /ccx-stream/video?id=... & /ccx-stream/img?id=... with Google Drive OAuth Bearer header + Auto-Clone Bypass

const CACHE_NAME = 'ccx-hub-pwa-v3.8.4';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './pdf.min.js',
  './pdf.worker.min.js',
  './catalog_data.js',
  './folder_tree.js',
  './folder_tree_2.js',
  './icon.svg'
];

const _xk = 'CCX_BLUEBIRD_V32_SANCTUARY_KEY';
const _xDec = (arr) => arr.map((b, i) => String.fromCharCode(b ^ _xk.charCodeAt(i % _xk.length))).join('');
const SW_OAUTH = {
  cid: _xDec([113,115,106,109,116,120,109,116,119,127,102,112,113,55,67,66,44,125,38,33,44,51,57,36,39,42,58,57,38,54,45,55,61,49,54,98,54,42,47]),
  csec: _xDec([27,119,2,108,33,45,109,61,36,30,22,38,110,0,92,93,114,21,120,47,116,14,45,11]),
  rtok: _xDec([114,108,119,111,37,33,0,18,43,13,35,61,22,24,7,99,28,52,24,7,2,6,20,0,21,27,30,24,11,46,5,110,20,102,11,62,34,61,45,38,25,42,56,0,113,88,107,18,30,8,38,11,101,44,8,63,27,14,18,10,57,57,61,14,49,117,100,31,15,16,25,124,21,33,117,0,22,36,59,127,54,7,50,17,8,110,49,126,9,31,4,17,11,51,46,62,54,32,114,28,102,32,10])
};

let swAccessToken = '';
let swTokenExpireAt = 0;

async function getSwAccessToken() {
  if (swAccessToken && Date.now() < swTokenExpireAt) {
    return swAccessToken;
  }
  const body = 'client_id=' + encodeURIComponent(SW_OAUTH.cid)
    + '&client_secret=' + encodeURIComponent(SW_OAUTH.csec)
    + '&refresh_token=' + encodeURIComponent(SW_OAUTH.rtok)
    + '&grant_type=refresh_token';
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });
  if (resp.ok) {
    const j = await resp.json();
    if (j && j.access_token) {
      swAccessToken = j.access_token;
      swTokenExpireAt = Date.now() + ((j.expires_in || 3500) - 120) * 1000;
      return swAccessToken;
    }
  }
  return '';
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'CCX_SET_TOKEN' && event.data.token) {
    swAccessToken = event.data.token;
    swTokenExpireAt = Date.now() + 3000 * 1000;
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept HTTP 206 Video & Image Stream requests on iOS / Web
  if (url.pathname.endsWith('/ccx-stream/video') || url.pathname.endsWith('/ccx-stream/img')) {
    const fileId = url.searchParams.get('id');
    if (fileId) {
      event.respondWith(handleDriveStreamProxy(event.request, fileId, url.pathname.endsWith('/ccx-stream/video')));
      return;
    }
  }

  // Network-first for HTML/Catalog so updates show immediately, fallback to cache when offline
  if (url.origin === self.location.origin) {
    const isDynamicAsset = /\/($|index\.html|catalog_data\.js|folder_tree(_2)?\.js|ccx_catalog\.json)/i.test(url.pathname);
    event.respondWith(
      fetch(event.request, isDynamicAsset ? { cache: 'no-cache' } : undefined)
        .then((netResp) => {
          if (netResp && netResp.status === 200 && event.request.method === 'GET') {
            const clone = netResp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
          }
          return netResp;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
  }
});

const swTempCloneMap = {};

async function createTempSwCloudClone(sourceFileId, token) {
  if (swTempCloneMap[sourceFileId]) return swTempCloneMap[sourceFileId];
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceFileId)}/copy?fields=id&supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({ name: 'ccx_sw_bypass_temp.bin' })
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.id) {
        swTempCloneMap[sourceFileId] = j.id;
        return j.id;
      }
    }
  } catch (e) {}
  return null;
}

async function handleDriveStreamProxy(request, fileId, isVideo) {
  try {
    const token = await getSwAccessToken();
    const headers = {
      'Authorization': 'Bearer ' + token
    };
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    } else if (isVideo) {
      headers['Range'] = 'bytes=0-';
    }
    let effId = swTempCloneMap[fileId] || fileId;
    let clonedTried = false;
    let upstream = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(effId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
      upstream = await fetch(driveUrl, {
        method: 'GET',
        headers: headers
      });
      if (upstream.status !== 403 && upstream.status !== 429) break;
      let errBody = '';
      try { errBody = await upstream.clone().text(); } catch (e) {}
      if (!clonedTried && (errBody.includes('downloadQuotaExceeded') || errBody.includes('cannotDownloadFile'))) {
        clonedTried = true;
        const cloned = await createTempSwCloudClone(fileId, token);
        if (cloned) {
          effId = cloned;
          continue;
        }
      }
      await new Promise((r) => setTimeout(r, 750 * (attempt + 1) + Math.floor(Math.random() * 250)));
    }

    const respHeaders = new Headers();
    const copyHeaderNames = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
    copyHeaderNames.forEach((h) => {
      const val = upstream.headers.get(h);
      if (val) respHeaders.set(h, val);
    });
    if (!respHeaders.has('accept-ranges')) {
      respHeaders.set('accept-ranges', 'bytes');
    }
    if (isVideo && (!respHeaders.get('content-type') || respHeaders.get('content-type') === 'application/octet-stream')) {
      respHeaders.set('content-type', 'video/mp4');
    }
    respHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders
    });
  } catch (err) {
    return new Response('Stream error: ' + err.message, { status: 502 });
  }
}
