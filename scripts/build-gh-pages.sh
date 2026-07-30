#!/bin/bash
# Build script for GitHub Pages deployment

echo "Building for GitHub Pages..."

# Run the standard build
npm run build

# Preserve OCR runtime assets (onnxruntime-web wasm + PaddleOCR models).
# These are large binaries that live only in docs/ (not emitted by the Vite
# build), so they must survive the docs/ rebuild below.
OCR_TMP="$(mktemp -d)"
if [ -d docs ]; then
  [ -d docs/models ] && cp -r docs/models "$OCR_TMP/"
  mkdir -p "$OCR_TMP/assets"
  for f in docs/ort-wasm-*.wasm; do [ -e "$f" ] && cp "$f" "$OCR_TMP/"; done
  for f in docs/assets/ort-wasm-*.wasm; do [ -e "$f" ] && cp "$f" "$OCR_TMP/assets/"; done
fi

# Clear and recreate docs folder
rm -rf docs
mkdir -p docs

# Copy build output to docs
cp -r dist/public/* docs/

# Restore preserved OCR runtime assets
[ -d "$OCR_TMP/models" ] && cp -r "$OCR_TMP/models" docs/
mkdir -p docs/assets
for f in "$OCR_TMP"/ort-wasm-*.wasm; do [ -e "$f" ] && cp "$f" docs/; done
for f in "$OCR_TMP"/assets/ort-wasm-*.wasm; do [ -e "$f" ] && cp "$f" docs/assets/; done
rm -rf "$OCR_TMP"

# Add .nojekyll to prevent Jekyll processing
touch docs/.nojekyll

# Create 404.html for SPA routing
cp docs/index.html docs/404.html

# Update paths in HTML files for /splice/ base
sed -i 's|href="/manifest.json"|href="/splice/manifest.json"|g' docs/index.html docs/404.html
sed -i 's|src="/assets/|src="/splice/assets/|g' docs/index.html docs/404.html
sed -i 's|href="/assets/|href="/splice/assets/|g' docs/index.html docs/404.html

# Update manifest.json
cat > docs/manifest.json << 'EOF'
{
  "name": "Fiber Splice Manager",
  "short_name": "Fiber Splice",
  "description": "Fiber Optic Cable Splicing Management Application - Fully Offline",
  "start_url": "/splice/",
  "scope": "/splice/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#1e293b",
  "orientation": "any",
  "icons": [
    {
      "src": "/splice/pwa-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/splice/pwa-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/splice/pwa-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
EOF

# Update service worker paths
sed -i "s|'/'|'/splice/'|g" docs/sw.js
sed -i "s|'/index.html'|'/splice/index.html'|g" docs/sw.js
sed -i "s|'/manifest.json'|'/splice/manifest.json'|g" docs/sw.js

echo "GitHub Pages build complete! Files are in docs/"
echo "Now commit and push to GitHub."
