---
sidebar_position: 3
title: Execute Transfers
---

# Execute Transfers Workflow

The `execute-transfers` workflow is responsible for moving funds through the vault. It polls the server for pending transfers, signs them with the pool wallet, and submits them to the vault's private transfer API.

## Execution Flow

```
1. Fetch pending transfers from server
2. For each transfer (max 3 per cycle):
   a. Sign an EIP 712 private transfer request
   b. Submit to the vault's /private-transfer endpoint
3. Confirm executed transfers on the server
```

## Why a Separate Workflow

Fund transfers are separated from matching for several reasons:

- **Rate limiting.** The vault API may have rate limits or require sequential processing. Separating transfer execution allows the matching engine to produce proposals without waiting for fund movement.
- **Retry resilience.** If a transfer fails, it remains in the pending queue and is retried on the next cycle without affecting the matching engine.
- **Budget management.** Each CRE execution has a 5 call budget. Matching uses 2 to 3 calls. Transfers need their own execution window.
- **Timing.** Transfers run every 15 seconds (more frequent than matching at 30 seconds) to minimize fund delivery latency.

## Transfer Signing

The CRE signs each transfer using EIP 712 typed data with the pool wallet's private key (stored as a DON secret):

```typescript
import { Wallet } from "ethers";

const poolWallet = new Wallet(config.poolPrivateKey);

const signature = await poolWallet.signTypedData(
  {
    name: "Vault",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.vaultAddress,
  },
  {
    Transfer: [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    sender: poolAddress,
    recipient: transfer.recipient,
    token: transfer.token,
    amount: transfer.amount,
  }
);
```

## Transfer Execution

Signed transfers are submitted to the vault's external API:

```typescript
ConfidentialHTTPClient.sendRequest(runtime, {
  url: `${config.externalApiUrl}/private-transfer`,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sender: poolAddress,
    senderSignature: signature,
    recipient: transfer.recipient,
    token: transfer.token,
    amount: transfer.amount,
  }),
}).result();
```

The vault verifies the signature, checks that the sender has sufficient shielded balance, and executes the private transfer.

## Batch Constraints

Each execution cycle processes at most 3 transfers due to the CRE's 5 call budget:

| Call | Purpose |
|------|---------|
| 1 | GET /internal/pending-transfers |
| 2 | POST /private-transfer (transfer 1) |
| 3 | POST /private-transfer (transfer 2) |
| 4 | POST /private-transfer (transfer 3) |
| 5 | POST /internal/confirm-transfers |

If more than 3 transfers are pending, the remaining ones are picked up on the next cycle (15 seconds later).

## Confirmation

After executing transfers, the workflow confirms them on the server so they are not re processed:

```typescript
ConfidentialHTTPClient.sendRequest(runtime, {
  url: `${config.ghostApiUrl}/api/v1/internal/confirm-transfers`,
  method: "POST",
  headers: {
    "x-api-key": config.internalApiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ transferIds: executedIds }),
}).result();
```

## Transfer Types

The workflow handles all transfer types produced by the server:

| Reason | Source | Destination | Trigger |
|--------|--------|-------------|---------|
| `disburse` | Pool | Borrower | Loan accepted |
| `cancel-lend` | Pool | Lender | Lend intent cancelled |
| `cancel-borrow` | Pool | Borrower | Borrow cancelled or rejected (95% return) |
| `cancel-borrow` | Pool | Protocol | Rejection penalty (5% slash) |
| `return-collateral` | Pool | Borrower | Loan fully repaid |
| `return-collateral-repay` | Pool | Lender | Lender payout on repayment |
| `liquidate` | Pool | Lender | Collateral distribution on default |
| `liquidate` | Pool | Protocol | Liquidation fee (5%) |

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `schedule` | Cron interval | Every 15 seconds |
| `ghostApiUrl` | GHOST API base URL | Required |
| `internalApiKey` | API key for internal endpoints | DON Secret |
| `externalApiUrl` | Vault API base URL | DON Secret |
| `vaultAddress` | Vault contract address | Config |
| `chainId` | Target chain ID | 11155111 |
| `poolPrivateKey` | Pool wallet private key for signing | DON Secret |
