import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/splice/' : '/',
  plugins: [
    {
      name: "clear-localhost-app-data",
      configureServer(server) {
        server.middlewares.use("/__clear-localhost-data", (_req, res) => {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Clear-Site-Data", "\"cache\", \"storage\"");
          res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Clearing Local App Data</title>
  </head>
  <body>
    <script>
      (async () => {
        const dbNames = ["FiberSpliceDB", "CopperSpliceDB"];
        await Promise.all(dbNames.map(name => new Promise(resolve => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        })));

        localStorage.clear();
        sessionStorage.clear();

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        }

        location.replace("/?fresh=" + Date.now());
      })();
    </script>
    Clearing local app data...
  </body>
</html>`);
        });
      },
    },
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  optimizeDeps: {},
  server: {
    host: "0.0.0.0",
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
