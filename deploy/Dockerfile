# FiberMapConnect ("splice") — client-side PWA served as a static site.
# The Express server in this repo is incomplete/unused (it imports a missing
# ./storage module); the real product is the client PWA (IndexedDB storage),
# the same build that ships to GitHub Pages. We build only the client, at root
# base (--base=/) so it serves at the subdomain root instead of /splice/.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build --base=/

FROM nginx:1.27-alpine
COPY --from=build /app/dist/public /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
