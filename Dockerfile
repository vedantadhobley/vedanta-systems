FROM node:18-alpine AS builder

# Accept build arg
ARG VITE_GITHUB_TOKEN
ENV VITE_GITHUB_TOKEN=${VITE_GITHUB_TOKEN}

WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:18-alpine

# Install cloudflared
RUN apk add --no-cache wget && \
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared && \
    apk del wget

WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist

# Start script that runs both serve and cloudflared
COPY start-with-tunnel.sh /start-with-tunnel.sh
RUN chmod +x /start-with-tunnel.sh

EXPOSE 3000

CMD ["/start-with-tunnel.sh"]
