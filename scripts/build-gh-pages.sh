#!/bin/bash
# Build script for GitHub Pages deployment

echo "Building for GitHub Pages..."

# Run the standard build
npm run build

# Clear and recreate docs folder
rm -rf docs
mkdir -p docs

# Copy build output to docs
cp -r dist/public/* docs/

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
