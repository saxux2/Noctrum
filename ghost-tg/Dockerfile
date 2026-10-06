FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source, assets, and env
COPY src/ src/
COPY tsconfig.json .
COPY welcome-banner.png .
COPY .env .

# Create data directory for wallet persistence
RUN mkdir -p data/wallets

# Persist wallet data across restarts
VOLUME /app/data

CMD ["bun", "run", "src/index.ts"]
