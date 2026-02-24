import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/splice/' : '/',
  plugins: [
    react(),
    runtimeErrorOverlay(),
    viteStaticCopy({
      targets: [
        {
          src: path.resolve(import.meta.dirname, "node_modules/@gutenye/ocr-models/assets").replace(/\\/g, "/") + "/{ch_PP-OCRv4_det_infer.onnx,ch_PP-OCRv4_rec_infer.onnx,ppocr_keys_v1.txt}",
          dest: "models",
        },
        {
          src: path.resolve(import.meta.dirname, "node_modules/onnxruntime-web/dist").replace(/\\/g, "/") + "/*.wasm",
          dest: ".",
        },
      ],
    }),
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
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  assetsInclude: ["**/*.onnx"],
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
