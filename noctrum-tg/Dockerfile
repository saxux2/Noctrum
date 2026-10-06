FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source and assets (env is supplied at runtime: docker run --env-file .env, D-18)
COPY src/ src/
COPY tsconfig.json .
COPY welcome-banner.png .

# Create data directory for wallet persistence
RUN mkdir -p data/wallets

# Wallet data lives in /app/data: mount a volume there (docker run -v <dir>:/app/data, or a Railway volume).
# No VOLUME instruction: Railway rejects it.

CMD ["bun", "run", "src/index.ts"]
