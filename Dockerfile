FROM node:18-alpine AS builder

# Accept build args
ARG VITE_GITHUB_TOKEN
ARG VITE_FOOTY_API_URL
ARG VITE_SPIN_CYCLE_API_URL
ENV VITE_GITHUB_TOKEN=${VITE_GITHUB_TOKEN}
ENV VITE_FOOTY_API_URL=${VITE_FOOTY_API_URL}
ENV VITE_SPIN_CYCLE_API_URL=${VITE_SPIN_CYCLE_API_URL}

WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM nginx:alpine

# Node.js for the OG image server. Cloudflared is no longer bundled —
# it lives in ~/workspace/proxy/ as its own service.
RUN apk add --no-cache nodejs

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/dist /app/dist

# Copy OG server
COPY og-server.js /app/og-server.js

# Startup: nginx + og-server
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000

CMD ["/start.sh"]
