// Service Worker for Fiber Splice Manager PWA
const CACHE_NAME = 'fiber-splice-v4';

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching app shell');
      // Cache the basic shell - other assets will be cached on first request
      return cache.addAll([
        '/splice/',
        '/splice/index.html',
        '/splice/manifest.json'
      ]);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Ensure the service worker takes control immediately
  return self.clients.claim();
});

// Fetch event - Network First for API calls, Cache First for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip blob: URLs and data: URLs - these are for file downloads
  if (url.protocol === 'blob:' || url.protocol === 'data:') {
    return;
  }

  // Handle Tesseract.js CDN requests for offline OCR support
  if (url.origin !== location.origin) {
    // Cache Tesseract.js language files from unpkg.com, jsdelivr.net, or cdn.jsdelivr.net
    if (url.hostname.includes('unpkg.com') || 
        url.hostname.includes('jsdelivr.net') ||
        url.pathname.includes('tesseract')) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) {
            console.log('Service Worker: Returning cached Tesseract resource:', url.pathname);
            return cached;
          }
          
          return fetch(request).then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }
            
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              console.log('Service Worker: Caching Tesseract resource:', url.pathname);
              cache.put(request, responseClone);
            });
            
            return response;
          }).catch((error) => {
            console.error('Service Worker: Failed to fetch Tesseract resource:', url.pathname, error);
            throw error;
          });
        })
      );
      return;
    }
    
    // Skip all other cross-origin requests
    return;
  }

  // API requests - Network First strategy (with cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful API responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(request).then((cached) => {
            return cached || new Response(
              JSON.stringify({ error: 'Offline - no cached data available' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // For all other requests (HTML, JS, CSS, images, fonts) - Cache First strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      // Return cached version if available
      if (cached) {
        return cached;
      }

      // Otherwise fetch from network and cache it
      return fetch(request).then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseClone = response.clone();

        // Cache the response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });

        return response;
      }).catch((error) => {
        console.error('Service Worker: Fetch failed for', request.url, error);
        
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/splice/index.html');
        }
        
        throw error;
      });
    })
  );
});

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    // Send acknowledgment to prevent "no response" warnings
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }
});
