FROM node:18-alpine AS builder

# Accept build args
ARG VITE_GITHUB_TOKEN
ARG VITE_FOOTY_API_URL
ENV VITE_GITHUB_TOKEN=${VITE_GITHUB_TOKEN}
ENV VITE_FOOTY_API_URL=${VITE_FOOTY_API_URL}

WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM nginx:alpine

# Install cloudflared
RUN apk add --no-cache wget && \
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared && \
    apk del wget

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/dist /app/dist

# Start script that runs both nginx and cloudflared
COPY start-with-tunnel.sh /start-with-tunnel.sh
RUN chmod +x /start-with-tunnel.sh

EXPOSE 3000

CMD ["/start-with-tunnel.sh"]
