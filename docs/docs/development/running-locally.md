---
sidebar_position: 1
title: Running Locally
---

# Running Locally

This guide covers setting up the NOCTRUM development environment, starting the server, and connecting to the required infrastructure.

## Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Bun | Latest | Runtime for all packages |
| MongoDB | 7.x+ | State storage |
| Node.js | 20+ | Required by some tooling |

## Server Setup

### Install Dependencies

```bash
cd server
bun install
```

### Environment Variables

Create a `.env` file in the `server/` directory:

```bash
MONGODB_URI=mongodb://localhost:27017/noctrum
POOL_PRIVATE_KEY=<your-pool-wallet-private-key>
TOKEN_ADDRESS=<nUSD-token-address>
CRE_PUBLIC_KEY=<secp256k1-public-key-hex>
EXTERNAL_API_URL=https://convergence2026-token-api.cldev.cloud
EXTERNAL_VAULT_ADDRESS=0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13
CHAIN_ID=11155111
PORT=3000
INTERNAL_API_KEY=<your-api-key>
ARBITRUM_RPC_URL=<arbitrum-rpc-url>
ETH_USD_FEED=<chainlink-feed-address>
NETH_ADDRESS=<nETH-token-address>
```

### Start the Server

```bash
cd server
bun run --hot src/index.ts
```

The `--hot` flag enables hot module reloading. The server starts on the configured port (default 3000).

### Verify

```bash
curl http://localhost:3000/health
```

Should return a 200 OK response.

## MongoDB Setup

If running MongoDB locally:

```bash
# Using Homebrew (macOS)
brew services start mongodb-community

# Or with Docker
docker run -d -p 27017:27017 --name noctrum-mongo mongo:7
```

The default connection string is `mongodb://localhost:27017/noctrum`.

## CRE Workflow Development

CRE workflows are in the `noctrum-settler/` directory. Each workflow has its own package.json.

### Install Dependencies

```bash
cd noctrum-settler/settle-loans && bun install
cd ../execute-transfers && bun install
cd ../check-loans && bun install
```

### Simulate a Workflow

Use the Chainlink CRE CLI to simulate workflow execution:

```bash
cd noctrum-settler
cre workflow simulate ./settle-loans \
  --target=staging-settings \
  --non-interactive \
  --trigger-index=0
```

This runs the workflow locally using the staging configuration, simulating a single cron trigger.

### Workflow Configuration

Each workflow has a `config.staging.json`:

```json
{
  "schedule": "every 30 seconds",
  "noctrumApiUrl": "http://localhost:3000",
  "internalApiKey": "your-key-here"
}
```

For local development, point `noctrumApiUrl` to your local server.

## Project Structure Reference

```
noctrum/
  server/           # Start here: bun run --hot src/index.ts
  noctrum-settler/
    settle-loans/   # CRE matching engine
    execute-transfers/  # CRE fund executor
    check-loans/    # CRE health monitor
  e2e-test/         # Integration tests
  frontend/         # Marketing site
  client/           # App frontend
  noctrum-tg/         # Telegram bot
  noctrum-raycast/    # Raycast extension
```

## Common Issues

| Issue | Solution |
|-------|----------|
| MongoDB connection refused | Ensure MongoDB is running on port 27017 |
| Missing CRE_PUBLIC_KEY | Generate a secp256k1 key pair and set the public key |
| ECIES decryption failure | Ensure eciesjs v0.4 is installed (not v0.3 or v0.5) |
| CRE simulation fails | Install the Chainlink CRE CLI: `npm i -g @chainlink/cre-cli` |
| Port already in use | Change PORT in .env or kill the existing process |
