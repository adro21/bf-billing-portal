# Bounce Forward billing portal — Express + EJS, no database.
# Node pinned to a patched release (Oct 21 2026 security advisory; Brotli RCE).
FROM node:24.22.1-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
