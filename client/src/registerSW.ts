// Register service worker for PWA functionality
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Derive from the Vite base so it matches wherever the app is served
      // ("/splice/sw.js" on GitHub Pages, "/sw.js" at the subdomain root).
      const swPath = `${import.meta.env.BASE_URL}sw.js`;
      navigator.serviceWorker
        .register(swPath)
        .then((registration) => {
          console.log('SW registered:', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('New version available! Please refresh.');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.log('SW registration failed:', error);
        });
    });
  }
}
