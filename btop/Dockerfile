# btop Server - AMD APU GTT Memory + Broadcast Web Interface
#
# Runs btop with:
# - AMD APU patches (GTT memory, rocm-smi v1.x support)
# - IP address hidden for public display
# - Broadcast server (NOT per-client WebSocket)
#
# Architecture:
#   btop → tmux → capture (raw ANSI) → SSE broadcast → xterm.js (browser)
#
# Requires host mounts to see actual system stats (see docker-compose.yml)

FROM ubuntu:24.04 AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    g++-14 \
    librocm-smi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy btop source with AMD APU patches pre-applied
COPY src/ .

# Build with GPU support
RUN CXX=g++-14 make GPU_SUPPORT=true -j$(nproc)

# Runtime image
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    librocm-smi64-1 \
    tmux \
    python3 \
    python3-pip \
    locales \
    curl \
    unzip \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && locale-gen en_US.UTF-8

# Download JetBrainsMono Nerd Font (has all Unicode symbols btop uses)
RUN mkdir -p /usr/share/fonts/nerd-fonts && \
    cd /tmp && \
    curl -fLo "JetBrainsMono.zip" https://github.com/ryanoasis/nerd-fonts/releases/download/v3.3.0/JetBrainsMono.zip && \
    unzip -o JetBrainsMono.zip -d /usr/share/fonts/nerd-fonts && \
    rm JetBrainsMono.zip && \
    fc-cache -fv

# Install Pillow for ANSI→PNG rendering
RUN pip3 install --break-system-packages Pillow

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

COPY --from=builder /build/bin/btop /usr/local/bin/btop
COPY btop.conf /etc/btop/btop.conf
COPY themes/ /etc/btop/themes/
COPY viewer.html /var/www/viewer.html
COPY broadcast-server.py /usr/local/bin/broadcast-server.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/broadcast-server.py

# Broadcast server port
# Dev: 4102, Prod: 3102
EXPOSE 4102 3102

ENV BTOP_CONFIG=/etc/btop/btop.conf
# Set to "local" for local btop, or "user@host" for SSH remote
ENV BTOP_HOST=local

ENTRYPOINT ["/entrypoint.sh"]
