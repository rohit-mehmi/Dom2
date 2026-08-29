/* ==========================================================================
   sw.js — site-wide offline fallback service worker
   --------------------------------------------------------------------------
   Scope: must live at the SITE ROOT (e.g. https://yoursite.com/sw.js) so its
   default scope covers every page on the domain. If it's placed in a
   subfolder, it can only control pages inside that subfolder.

   What this does:
   - On first online visit: caches offline.html + its CSS/JS (the "offline
     kit"). Nothing else on your site is pre-cached.
   - While online: every page and asset loads from the network as normal.
     This worker does not hijack normal browsing.
   - While offline: if a page navigation fails (no network), it serves
     offline.html instead of the browser's default error page — no matter
     which page the user was trying to reach.
   - Opportunistically remembers the last few pages a user actually visited
     while online, so — if offline — revisiting one of THOSE specific pages
     can still show the real page instead of the offline fallback. This is
     a bonus, not a full offline mirror of the site.
   - 404s are left alone. A service worker only ever sees a "fetch failed"
     condition when there's no network; a normal 404 response from the
     server is a successful fetch (just with a 404 status), so it's never
     confused with "offline".
   ========================================================================== */

// Bump this string on every deploy where offline.html / its assets change.
// Old caches are deleted automatically on activate — see below.
const CACHE_VERSION = "v1";
const OFFLINE_CACHE = `site-offline-${CACHE_VERSION}`;
const RUNTIME_CACHE = `site-runtime-${CACHE_VERSION}`;

// Everything the offline experience needs, and nothing else.
// Resolve everything relative to the folder this service worker actually
// lives in (self.location), not a hardcoded "/" root. This is what makes
// the exact same file work whether the site is hosted at a domain root
// or under a GitHub Pages project subpath like /Dom2/ — a hardcoded
// "/offline.html" only resolves correctly in the first case.
const SW_DIR = self.location.href.replace(/[^/]*$/, "");
const OFFLINE_URL = new URL("offline.html", SW_DIR).pathname;
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  new URL("offline.css", SW_DIR).pathname,
  new URL("offline-game.js", SW_DIR).pathname,
];

// How many recently-visited real pages to opportunistically keep around
// for offline viewing. Keeps the runtime cache from growing indefinitely.
const RUNTIME_CACHE_LIMIT = 20;

// ---------------------------------------------------------------------------
// INSTALL — cache the offline kit, then activate immediately (skipWaiting).
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      // addAll fails atomically if any single file 404s — that's intentional,
      // it surfaces a broken path immediately instead of half-caching.
      await cache.addAll(OFFLINE_ASSETS);
      self.skipWaiting();
    })()
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE — drop any cache from a previous version, then take control of
// already-open tabs so the fallback works without needing a manual reload.
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== OFFLINE_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------------
// Helper: trim the runtime cache down to RUNTIME_CACHE_LIMIT entries,
// oldest first (Cache API preserves insertion order for keys()).
// ---------------------------------------------------------------------------
async function trimRuntimeCache() {
  const cache = await caches.open(RUNTIME_CACHE);
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_CACHE_LIMIT) return;
  const excess = keys.length - RUNTIME_CACHE_LIMIT;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

// ---------------------------------------------------------------------------
// FETCH
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET requests (form POSTs, etc.) — let the browser
  // handle those natively, online or not.
  if (request.method !== "GET") return;

  // Only handle same-origin requests. Cross-origin (analytics, third-party
  // embeds, etc.) pass straight through untouched.
  if (new URL(request.url).origin !== self.location.origin) return;

  // --- Page navigations (the actual "user clicked/typed a URL" case) -----
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Successful response (includes normal 404s — those are fine,
          // they're real responses, not network failures). Opportunistically
          // remember this page for future offline visits.
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
            trimRuntimeCache();
          }
          return networkResponse;
        } catch (err) {
          // Network is unreachable. First check if we happen to have this
          // exact page cached from a previous visit; otherwise fall back
          // to the offline page.
          const runtimeMatch = await caches.match(request, { cacheName: RUNTIME_CACHE });
          if (runtimeMatch) return runtimeMatch;

          const offlinePage = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
          return offlinePage;
        }
      })()
    );
    return;
  }

  // --- Everything else (CSS/JS/images/etc.) -------------------------------
  // Only the offline kit's own assets get a cache-first guarantee — that's
  // what has to work with zero network. Normal site assets just try the
  // network, and fall back to a cached copy only if one happens to exist
  // (e.g. it was pulled in alongside a runtime-cached page).
  if (OFFLINE_ASSETS.includes(new URL(request.url).pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: OFFLINE_CACHE });
        return cached || fetch(request);
      })()
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
