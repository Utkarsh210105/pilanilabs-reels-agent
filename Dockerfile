# PilaniLabs reels agent for Cloud Run: API + built dashboard on one port.
FROM node:22-bookworm-slim

# ffmpeg (Debian's build includes libass for captions) and fonts.
# fonts-liberation provides Arial-compatible metrics, so captions and cards
# that ask for "Arial" render the same as on the laptop.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-liberation fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY api/package.json api/package-lock.json api/
RUN npm --prefix api ci --omit=dev

COPY dashboard/package.json dashboard/package-lock.json dashboard/
RUN npm --prefix dashboard ci

COPY api api
COPY dashboard dashboard
RUN npm --prefix dashboard run build && rm -rf dashboard/node_modules

ENV NODE_ENV=production
ENV MEDIA_DIR=/mnt/media
# Cloud Run sets PORT (8080).
CMD ["node", "api/server.js"]
