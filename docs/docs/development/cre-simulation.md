---
sidebar_position: 3
title: CRE Simulation
---

# CRE Simulation

Chainlink's CRE CLI provides a local simulation environment for testing GHOST's confidential workflows without deploying to the DON.

## Prerequisites

Install the CRE CLI:

```bash
npm install -g @chainlink/cre-cli
```

Verify installation:

```bash
cre --version
```

## Simulating Workflows

### Settle Loans

```bash
cd ghost-settler
cre workflow simulate ./settle-loans \
  --target=staging-settings \
  --non-interactive \
  --trigger-index=0
```

This simulates a single cron trigger of the matching engine. The workflow will:

1. Call `expireProposals` on the GHOST server
2. Fetch pending intents
3. Decrypt rates (using the test private key from config)
4. Run matching
5. Post proposals back to the server

### Execute Transfers

```bash
cre workflow simulate ./execute-transfers \
  --target=staging-settings \
  --non-interactive \
  --trigger-index=0
```

### Check Loans

```bash
cre workflow simulate ./check-loans \
  --target=staging-settings \
  --non-interactive \
  --trigger-index=0
```

## Configuration for Simulation

Each workflow's `config.staging.json` should point to your local server for simulation:

```json
{
  "schedule": "every 30 seconds",
  "ghostApiUrl": "http://localhost:3000",
  "internalApiKey": "your-local-api-key"
}
```

DON secrets are resolved differently in simulation mode. The CRE CLI reads them from local environment variables or a `.secrets` file rather than the DON's secret store.

## Simulation vs Production

| Aspect | Simulation | Production |
|--------|-----------|------------|
| Execution environment | Local Node.js/WASM | DON TEE nodes |
| Secret management | Local env vars / .secrets file | DON threshold secret store |
| HTTP client | Direct fetch | ConfidentialHTTPClient (encrypted) |
| EVM reads | Direct RPC | EVMClient through DON |
| Trigger | Manual (CLI) | Cron schedule |
| Consensus | Single execution | Threshold consensus across DON nodes |

## WASM Compatibility Notes

When developing CRE workflows, be aware of WASM constraints:

**Compatible libraries:**
- `eciesjs` v0.4 (pure JS/WASM ECIES)
- `viem` v2 (Ethereum utilities)
- `@noble/hashes` (cryptographic hashes)
- `ethers` v6 (wallet signing, ABI encoding)

**Not compatible:**
- Node.js built in modules (`fs`, `crypto`, `net`, `path`)
- Native addons (anything requiring node-gyp)
- Libraries that use `process.env` directly (use config instead)

## Import Rules

All CRE SDK imports must come from the root package:

```typescript
// Correct
import { ConfidentialHTTPClient, EVMClient } from "@chainlink/cre-sdk";

// Incorrect (will fail in WASM)
import { ConfidentialHTTPClient } from "@chainlink/cre-sdk/http";
```

## HTTP Request Pattern

The CRE SDK uses a builder pattern for HTTP requests:

```typescript
const response = ConfidentialHTTPClient.sendRequest(runtime, {
  url: "https://example.com/api",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
  },
  body: JSON.stringify(payload),
}).result();

const data = JSON.parse(response.body);
```

Note the `.result()` call at the end. This is required to execute the request and retrieve the response synchronously within the WASM runtime.

## Workflow Handler Signature

Every CRE workflow exports a handler with this signature:

```typescript
import type { Runtime, CronPayload } from "@chainlink/cre-sdk";

interface Config {
  schedule: string;
  ghostApiUrl: string;
  internalApiKey: string;
  // ... workflow-specific config
}

export default function handler(
  runtime: Runtime<Config>,
  payload: CronPayload
): string {
  // Workflow logic here
  return "Execution summary";
}
```

The handler receives the runtime (with config and SDK access) and the cron payload (trigger metadata). It must return a string that is logged by the DON.

## Debugging Tips

| Problem | Solution |
|---------|----------|
| "Module not found" in WASM | Check that the dependency is WASM compatible and imported from root |
| ConfidentialHTTPClient returns empty | Check that `.result()` is called on the request |
| Secrets not resolving | In simulation, set them as env vars or in `.secrets` |
| EVMClient read fails | Verify RPC URL and contract address in config |
| Timeout during simulation | Increase CLI timeout with `--timeout=60000` |
