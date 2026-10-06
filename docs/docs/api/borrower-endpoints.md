---
sidebar_position: 3
title: Borrower Endpoints
---

# Borrower Endpoints

These endpoints handle the borrower lifecycle: submitting borrow intents, responding to match proposals, repaying loans, and managing collateral.

## POST /api/v1/borrow-intent

Submit a new borrow intent with collateral.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Token to borrow (e.g., gUSD address) |
| `amount` | string | Yes | Borrow amount (BigInt as string) |
| `maxRate` | string | Yes | Maximum acceptable rate (encrypted, hex string) |
| `collateralToken` | string | Yes | Collateral token address (e.g., gETH) |
| `collateralAmount` | string | Yes | Collateral offered (BigInt as string) |
| `signature` | string | Yes | EIP 712 signature over `SubmitBorrow` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "intentId": "borrow_abc123",
  "status": "pending"
}
```

### Behavior

1. Validates the EIP 712 signature
2. Fetches the borrower's credit tier and corresponding collateral multiplier
3. Fetches the current ETH/USD price
4. Validates that `collateralAmount * ethPrice >= borrowAmount * multiplier`
5. Debits the borrower's collateral balance
6. Creates a `BorrowIntent` with status `pending`

### Errors

| Status | Condition |
|--------|-----------|
| 401 | Signature verification failed |
| 400 | Insufficient collateral for credit tier |
| 400 | Insufficient collateral balance |

## POST /api/v1/cancel-borrow

Cancel a pending borrow intent and reclaim collateral.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intentId` | string | Yes | Borrow intent ID |
| `signature` | string | Yes | EIP 712 signature over `CancelBorrow` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "status": "cancelled",
  "collateralReturned": true
}
```

### Behavior

1. Validates signature and intent ownership
2. Marks the borrow intent as `cancelled`
3. Queues a transfer with reason `cancel-borrow` to return full collateral

## POST /api/v1/accept-proposal

Accept a match proposal and activate the loan.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposalId` | string | Yes | Match proposal ID |
| `signature` | string | Yes | EIP 712 signature over `AcceptProposal` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "loanId": "loan_xyz789",
  "principal": "10000000000",
  "effectiveRate": 0.0379,
  "matchedTicks": [
    { "lender": "0xAlice...", "amount": "5000000000", "rate": 0.035 },
    { "lender": "0xBob...", "amount": "5000000000", "rate": 0.04 }
  ]
}
```

### Behavior

1. Validates signature and proposal ownership
2. Verifies proposal status is `pending`
3. Creates an active `Loan` record with all matched tick details
4. Marks consumed lend intents as used
5. Queues a `disburse` transfer to send principal to the borrower
6. Marks the proposal as `accepted`

## POST /api/v1/reject-proposal

Reject a match proposal. Incurs the 5% collateral penalty.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposalId` | string | Yes | Match proposal ID |
| `signature` | string | Yes | EIP 712 signature over `RejectProposal` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "status": "rejected",
  "slashed": "250000000",
  "returned": "4750000000"
}
```

### Behavior

1. Validates signature and proposal ownership
2. Calculates 5% slash amount
3. Queues transfer of 5% to protocol pool (reason: `cancel-borrow`)
4. Queues transfer of 95% back to borrower (reason: `cancel-borrow`)
5. Releases all locked lend ticks back to available pool
6. Marks proposal as `rejected` and borrow intent as `rejected`

## POST /api/v1/repay

Repay an active loan in full.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `loanId` | string | Yes | Active loan ID |
| `signature` | string | Yes | EIP 712 signature over `RepayLoan` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Response

```json
{
  "status": "repaid",
  "totalPaid": "10379000000",
  "collateralReturned": "5000000000"
}
```

### Behavior

1. Validates signature and loan ownership
2. Calculates total owed: principal plus interest per tick at each tick's individual rate
3. Validates borrower has sufficient balance to cover repayment
4. Debits borrower's balance for total repayment amount
5. Credits each lender their principal plus interest at their tick rate
6. Queues payout transfers to each lender (reason: `return-collateral-repay`)
7. Queues collateral return to borrower (reason: `return-collateral`)
8. Marks loan as `repaid`
9. Upgrades borrower's credit tier

### Interest Calculation

Interest is computed per tick using discriminatory pricing:

```
For each matched tick:
  tickInterest = tick.amount * tick.rate * (loanDuration / 365)
  lenderPayout = tick.amount + tickInterest
```

Each lender earns their individual bid rate, not the blended rate.

## POST /api/v1/claim-excess-collateral

Claim excess collateral from an active loan when the position is overcollateralized.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `loanId` | string | Yes | Active loan ID |
| `signature` | string | Yes | EIP 712 signature over `ClaimExcessCollateral` |
| `timestamp` | number | Yes | Unix timestamp (seconds) |

### Behavior

1. Recalculates required collateral at current prices
2. Computes excess: `collateralAmount - requiredCollateral`
3. If excess exists, queues a transfer of the excess to the borrower
4. Updates the loan's collateral amount

## GET /api/v1/borrower-status/:address

Fetch all borrow intents, proposals, and active loans for a given address. No authentication required.

## GET /api/v1/collateral-quote

Get a quote for required collateral given borrow parameters.

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `amount` | Borrow amount |
| `collateralToken` | Collateral token address |
| `borrower` | Borrower address (for tier lookup) |

Returns the required collateral amount based on the borrower's credit tier and current prices.
