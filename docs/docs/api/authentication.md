---
sidebar_position: 1
title: Authentication
---

# Authentication

GHOST uses two authentication mechanisms: EIP 712 typed data signatures for user facing endpoints and API key authentication for internal CRE endpoints.

## EIP 712 Typed Data Signatures

All user facing endpoints require an EIP 712 signature that proves the request was authorized by the specified Ethereum address. This eliminates the need for session tokens or JWTs while providing cryptographic proof of identity.

### Domain Separator

```typescript
const EIP712_DOMAIN = {
  name: "GhostProtocol",
  version: "0.0.1",
  chainId: 11155111,  // Sepolia
  verifyingContract: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13"  // Vault address
};
```

### Message Types

Each endpoint has a specific message type that defines the signed payload:

| Endpoint | Message Type | Fields |
|----------|-------------|--------|
| Confirm Deposit | `ConfirmDeposit` | `slotId (string)`, `timestamp (uint256)` |
| Cancel Lend | `CancelLend` | `intentId (string)`, `timestamp (uint256)` |
| Submit Borrow | `SubmitBorrow` | `token (address)`, `amount (uint256)`, `maxRate (string)`, `collateralToken (address)`, `collateralAmount (uint256)`, `timestamp (uint256)` |
| Cancel Borrow | `CancelBorrow` | `intentId (string)`, `timestamp (uint256)` |
| Accept Proposal | `AcceptProposal` | `proposalId (string)`, `timestamp (uint256)` |
| Reject Proposal | `RejectProposal` | `proposalId (string)`, `timestamp (uint256)` |
| Repay Loan | `RepayLoan` | `loanId (string)`, `timestamp (uint256)` |
| Claim Excess Collateral | `ClaimExcessCollateral` | `loanId (string)`, `timestamp (uint256)` |

### Signature Verification

The server recovers the signer address from the EIP 712 signature and verifies it matches the expected user:

```typescript
const recoveredAddress = ethers.verifyTypedData(
  EIP712_DOMAIN,
  messageTypes,
  messagePayload,
  signature
);

if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
  throw new Error("Signature verification failed");
}
```

### Timestamp Validation

Each signed message includes a `timestamp` field. The server enforces a 5 minute window:

```typescript
const now = Math.floor(Date.now() / 1000);
const diff = Math.abs(now - timestamp);
if (diff > 300) {
  throw new Error("Timestamp too far from current time");
}
```

This prevents replay attacks where a captured signature is resubmitted after the intended action window.

### Client Side Signing

To sign a request, the client uses ethers.js or a compatible wallet:

```typescript
import { ethers } from "ethers";

const wallet = new ethers.Wallet(privateKey);

const signature = await wallet.signTypedData(
  {
    name: "GhostProtocol",
    version: "0.0.1",
    chainId: 11155111,
    verifyingContract: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13",
  },
  {
    ConfirmDeposit: [
      { name: "slotId", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    slotId: "abc123",
    timestamp: Math.floor(Date.now() / 1000),
  }
);
```

## Internal API Key Authentication

CRE facing endpoints under `/api/v1/internal/*` are authenticated using a shared API key passed in the `x-api-key` header:

```
GET /api/v1/internal/pending-intents
x-api-key: <INTERNAL_API_KEY>
```

The API key is configured via the `INTERNAL_API_KEY` environment variable. All internal endpoints check this header before processing the request. If the key is missing or incorrect, the request is rejected with a 401 status.

This is a simpler authentication model appropriate for machine to machine communication where the CRE is the only caller.
