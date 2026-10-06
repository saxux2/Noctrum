---
sidebar_position: 2
title: E2E Testing
---

# End to End Testing

The `e2e-test/` directory contains integration tests that exercise the full GHOST protocol flow, from deposits through matching to repayment.

## Setup

```bash
cd e2e-test
bun install
```

Ensure the GHOST server is running on `http://localhost:3000` before running tests.

## Test Scripts

The E2E tests are organized as numbered scripts that run sequentially:

| Script | Purpose |
|--------|---------|
| `src/01_transfer-funds.ts` | Deposit tokens into vault and private transfer to pool |
| `src/02_submit-intents.ts` | Submit lend intents with encrypted rates and borrow intents |
| `src/03_trigger-matching.ts` | Trigger the matching engine and verify proposals |
| `src/04_settlement.ts` | Accept proposals, verify loans, test repayment |

### Running Individual Steps

```bash
cd e2e-test
bun run src/01_transfer-funds.ts
bun run src/02_submit-intents.ts
bun run src/03_trigger-matching.ts
bun run src/04_settlement.ts
```

### Running All Steps

```bash
cd e2e-test
bun run index.ts
```

## What the Tests Cover

### Step 1: Transfer Funds

- Creates test wallets (lender and borrower)
- Deposits gUSD and gETH into the vault
- Executes private transfers to the GHOST pool address
- Verifies shielded balances

### Step 2: Submit Intents

- Lender submits encrypted rate bid via `/deposit-lend/init` and `/deposit-lend/confirm`
- Borrower submits borrow intent via `/borrow-intent`
- Verifies EIP 712 signature generation and validation
- Tests collateral adequacy checks

### Step 3: Trigger Matching

- Calls the internal matching endpoints (simulating CRE behavior)
- Verifies that proposals are generated with correct tick matching
- Tests rate decryption (plaintext mode for testing)
- Verifies blended rate calculation

### Step 4: Settlement

- Accepts a match proposal
- Verifies loan creation with correct terms
- Tests full repayment flow
- Verifies lender payouts at individual tick rates
- Tests collateral return
- Verifies credit tier upgrade after repayment

## Test Utilities

The `e2e-test/src/utils/` directory contains helpers:

| Utility | Purpose |
|---------|---------|
| Wallet generation | Create test wallets with deterministic keys |
| EIP 712 signing | Sign typed data for GHOST endpoints |
| Rate encryption | Encrypt rates with the test CRE public key |
| API client | Typed wrappers around GHOST API endpoints |

## Testing Without CRE

For local testing without running CRE workflows, the E2E tests can simulate CRE behavior by:

1. Calling internal endpoints directly with the API key
2. Using plaintext rates (the `decryptRate` function falls back to plaintext parsing)
3. Manually triggering matching and transfer execution

This allows testing the full protocol flow without the Chainlink DON infrastructure.
