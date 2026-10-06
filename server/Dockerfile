FROM oven/bun:1 AS base
WORKDIR /app

# install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# copy source
COPY . .

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
