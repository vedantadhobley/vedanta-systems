# btop Server - AMD APU GTT Memory + ttyd Web Interface
#
# Runs btop with:
# - AMD APU patches (GTT memory, rocm-smi v1.x support)
# - IP address hidden for public display
# - ttyd web terminal server
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
    ttyd \
    tmux \
    nginx \
    openssh-client \
    locales \
    && rm -rf /var/lib/apt/lists/* \
    && locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

COPY --from=builder /build/bin/btop /usr/local/bin/btop
COPY btop.conf /etc/btop/btop.conf
COPY themes/ /etc/btop/themes/
COPY wrapper.html /etc/btop/wrapper.html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Wrapper port (serves the fixed iframe page)
# Dev: 4102, Prod: 3102
EXPOSE 4102 3102
# ttyd port (internal, proxied by nginx)  
EXPOSE 7681

ENV BTOP_CONFIG=/etc/btop/btop.conf
# Set to "local" for local btop, or "user@host" for SSH remote
ENV BTOP_HOST=local

ENTRYPOINT ["/entrypoint.sh"]
