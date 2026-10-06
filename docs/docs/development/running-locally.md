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
TOKEN_ADDRESS=0x339a948f3667d222FAD43d313b3b8c3BE1415ad5
CRE_PUBLIC_KEY=03a62ca0efd28497d24e1cc2dc587f8e7e20ebc3de0c2315778997ead8bedda649
EXTERNAL_API_URL=http://localhost:8081
EXTERNAL_VAULT_ADDRESS=0x65877F6BFd3f2D293454658BCb290b112397Eeb5
CHAIN_ID=10143
PORT=8080
INTERNAL_API_KEY=<your-api-key>
ARBITRUM_RPC_URL=https://arbitrum-one-rpc.publicnode.com
ETH_USD_FEED=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
NETH_ADDRESS=0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A
```

### Start the Server

```bash
cd server
bun run --hot src/index.ts
```

The `--hot` flag enables hot module reloading. The server starts on the configured port (default 8080).

### Verify

```bash
curl http://localhost:8080/health
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

## Vault API Setup

`noctrum-vault-api` keeps the private ledger (shielded balances, private transfers, withdrawal tickets) and indexes `NoctrumVault` events on Monad Testnet. The server, CRE workflows and clients call it for every vault operation.

Its MongoDB must be a replica set, because ledger writes use transactions:

```bash
docker run -d -p 27017:27017 --name noctrum-mongo mongo:7 --replSet rs0
docker exec noctrum-mongo mongosh --eval "rs.initiate()"
```

Copy `noctrum-vault-api/.env.example` to `.env` and set `TICKET_SIGNER_PRIVATE_KEY` (its address must equal `NoctrumVault.ticketSigner`). Then:

```bash
cd noctrum-vault-api
bun install
bun run --hot src/index.ts
curl http://localhost:8081/health
```

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

Each workflow has a `config.staging.json` (deployed Railway services), a `config.production.json` and a `config.local.json` (localhost):

```json
{
  "schedule": "*/30 * * * * *",
  "noctrumApiUrl": "http://localhost:8080/api/v1"
}
```

For local development, simulate with `--target=local-settings`. Secrets (`INTERNAL_API_KEY`, `POOL_PRIVATE_KEY`, `CRE_PRIVATE_KEY`) are declared in `secrets.yaml` and read from `noctrum-settler/.env`.

## Project Structure Reference

```
noctrum/
  server/           # Start here: bun run --hot src/index.ts
  noctrum-vault-api/  # Private ledger: bun run --hot src/index.ts (port 8081)
  contracts/        # Foundry: NoctrumVault, SimpleToken, NoctrumSwapPool
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
| CRE simulation fails | Install the Chainlink CRE CLI (see CRE Simulation; it is not on npm) |
| Port already in use | Change PORT in .env or kill the existing process |
