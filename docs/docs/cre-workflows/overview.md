---
sidebar_position: 1
title: Overview
---

# CRE Workflows

Chainlink's Confidential Runtime Environment (CRE) is the computational brain of GHOST. It runs three cron triggered workflows that handle matching, fund execution, and health monitoring. Each workflow executes inside a trusted execution environment where encrypted data can be safely decrypted and processed.

## Workflow Summary

| Workflow | Trigger | Interval | Purpose |
|----------|---------|----------|---------|
| `settle-loans` | Cron | 30 seconds | Decrypt rates, run matching engine, generate proposals |
| `execute-transfers` | Cron | 15 seconds | Poll pending transfers, sign and submit to vault |
| `check-loans` | Cron | 60 seconds | Read price feeds, check health factors, trigger liquidations |

## CRE SDK Primitives

All workflows use the `@chainlink/cre-sdk` package. The key primitives are:

### ConfidentialHTTPClient

Used for encrypted HTTP communication between the CRE and the GHOST server:

```typescript
import { ConfidentialHTTPClient } from "@chainlink/cre-sdk";

const response = ConfidentialHTTPClient.sendRequest(runtime, {
  url: `${config.ghostApiUrl}/api/v1/internal/pending-intents`,
  method: "GET",
  headers: {
    "x-api-key": config.internalApiKey,
  },
}).result();
```

The `ConfidentialHTTPClient` encrypts requests and responses end to end between the CRE and the target server. The DON nodes cannot observe the plaintext of the communication.

### EVMClient

Used to read on chain state (price feeds, contract storage):

```typescript
import { EVMClient } from "@chainlink/cre-sdk";

const result = EVMClient.readContract(runtime, {
  chainName: "ethereum-testnet-sepolia-arbitrum-1",
  contractAddress: feedAddress,
  abi: PriceFeedAggregatorABI,
  functionName: "latestRoundData",
  args: [],
});
```

### CronTrigger

Each workflow is triggered on a schedule defined in `config.staging.json`:

```json
{
  "schedule": "every 30 seconds"
}
```

### DON Secrets

Sensitive values (private keys, API keys) are stored as DON secrets and injected into the workflow config at runtime. They are never visible in source code or logs.

## Execution Model

CRE workflows are **stateless**. Each execution cycle:

1. Receives a trigger event (cron tick)
2. Reads configuration from `config.staging.json` and DON secrets
3. Fetches current state from external sources (GHOST API, chain)
4. Performs computation (matching, signing, health checks)
5. Writes results back to external destinations
6. Returns a string result (logged by the DON)
7. Discards all in memory state

There is no persistent storage, no database connection, and no session state between executions. This simplifies security analysis and ensures that a compromised execution cannot leak state from previous runs.

## WASM Compatibility

CRE workflows compile to WASM for execution inside the DON. This imposes constraints on dependencies:

| Library | Status | Notes |
|---------|--------|-------|
| eciesjs v0.4 | Compatible | Pure JS/WASM ECIES implementation |
| viem v2 | Compatible | Ethereum utility library |
| @noble/hashes | Compatible | Cryptographic hash functions |
| ethers.js v6 | Compatible | Used for EIP 712 signing |
| Node.js built ins | Not available | No `fs`, `crypto`, `net`, etc. |

## Budget Constraints

Each CRE execution has a limited number of external calls (HTTP + chain reads). The current budget is 5 `ConfidentialHTTPClient` calls per execution. This is why the `execute-transfers` workflow batches at most 3 transfers per cycle (1 call to fetch pending, up to 3 calls to execute, 1 call to confirm).

## Configuration Files

Each workflow has a `config.staging.json` that defines:

```json
{
  "schedule": "every 30 seconds",
  "ghostApiUrl": "https://ghost-api.example.com",
  "internalApiKey": "DON_SECRET:internal_api_key",
  "externalApiUrl": "DON_SECRET:external_api_url",
  "vaultAddress": "0xE588...",
  "chainId": 11155111
}
```

Values prefixed with `DON_SECRET:` are resolved from the DON's secret store at runtime.
