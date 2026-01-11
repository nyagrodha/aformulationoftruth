FROM node:20-bullseye-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

WORKDIR /app

COPY package.json package-lock.json ./

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxkbcommon0 \
      libxrandr2 \
      python3 \
      xdg-utils \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data /app/logs /app/pdfs

EXPOSE 3001

CMD ["node", "server.js"]
