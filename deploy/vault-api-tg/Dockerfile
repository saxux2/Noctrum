# vault-api + noctrum-tg in one Railway service (free plan service limit, see README.md).
# Build context is assembled by deploy.sh: noctrum-vault-api/ and noctrum-tg/ side by side.
FROM oven/bun:1 AS base
WORKDIR /app

# vault-api at /app (same layout as noctrum-vault-api/Dockerfile)
COPY noctrum-vault-api/package.json noctrum-vault-api/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY noctrum-vault-api/ ./

# telegram bot at /app/tg (same layout as noctrum-tg/Dockerfile)
COPY noctrum-tg/package.json noctrum-tg/bun.lock tg/
RUN cd tg && bun install --frozen-lockfile --production
COPY noctrum-tg/src/ tg/src/
COPY noctrum-tg/tsconfig.json noctrum-tg/welcome-banner.png tg/

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Railway volume "vault-api-volume" is mounted at /app/tg-data and holds the bot wallets.
EXPOSE 8081

CMD ["/app/start.sh"]
