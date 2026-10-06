---
sidebar_position: 2
title: Lender Endpoints
---

# Lender Endpoints

These endpoints handle the lender lifecycle: initiating a deposit, confirming it with an encrypted rate bid, and cancelling an active lend position.

## POST /api/v1/deposit-lend/init

Initialize a deposit slot. This creates a pending slot that the lender must confirm within 10 minutes.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | Lender's Ethereum address |
| `token` | string | Yes | Token address (e.g., gUSD) |
| `amount` | string | Yes | Deposit amount (BigInt as string) |

### Response

```json
{
  "slotId": "slot_abc123",
  "epochId": "epoch_42",
  "expiresIn": "10 minutes"
}
```

### Behavior

1. Creates a `DepositSlot` with status `pending`
2. Associates it with the current epoch
3. The slot expires after 10 minutes if not confirmed (cleaned up by `expireOldSlots`)

## POST /api/v1/deposit-lend/confirm

Confirm a deposit slot with an EIP 712 signature and an encrypted rate bid.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slotId` | string | Yes | The slot ID from init |
| `encryptedRate` | string | Yes | ECIES encrypted rate (hex string) |
| `signature` | string | Yes | EIP 712 signature over `ConfirmDeposit` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "intentId": "intent_xyz789",
  "status": "confirmed"
}
```

### Behavior

1. Validates the EIP 712 signature recovers to the slot's `userId`
2. Validates the timestamp is within the 5 minute window
3. Updates the deposit slot status to `confirmed`
4. Credits the user's internal balance for the deposited amount
5. Creates a `LendIntent` with the encrypted rate and associates it with the epoch

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Slot not found or already confirmed |
| 401 | Signature verification failed |
| 400 | Timestamp outside allowed window |

## POST /api/v1/cancel-lend

Cancel an active lend intent and queue a return of funds.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intentId` | string | Yes | The lend intent ID to cancel |
| `signature` | string | Yes | EIP 712 signature over `CancelLend` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "status": "cancelled",
  "transferQueued": true
}
```

### Behavior

1. Validates the signature recovers to the intent's owner
2. Marks the deposit slot as `cancelled`
3. Queues a transfer with reason `cancel-lend` to return the funds to the lender
4. The CRE's `execute-transfers` workflow picks up the queued transfer and executes it

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Intent not found or already cancelled |
| 401 | Signature verification failed |
| 400 | Intent is locked in an active proposal (cannot cancel) |

## GET /api/v1/lender-status/:address

Fetch the current status of all lend positions for a given address.

### Response

Returns an array of the lender's deposit slots, lend intents, and any active proposals or loans their ticks are involved in. This endpoint does not require authentication.

## Lender Flow Summary

| Step | Action | Endpoint |
|------|--------|----------|
| 1 | Deposit tokens into vault | External vault API |
| 2 | Private transfer to pool | External vault API |
| 3 | Initialize deposit slot | `POST /deposit-lend/init` |
| 4 | Confirm with encrypted rate | `POST /deposit-lend/confirm` |
| 5 | Wait for matching (automatic) | CRE handles |
| 6 | Earn interest on matched loans | Automatic on repayment |
| 7 | Cancel if desired | `POST /cancel-lend` |
