---
sidebar_position: 2
title: Raycast Extension
---

# Raycast Extension

The GHOST Raycast extension (`ghost-raycast`) provides quick access to protocol operations directly from the Raycast launcher on macOS. It features a multi view interface with forms, lists, and detail views for all protocol operations.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Raycast API |
| UI | React 19 |
| Blockchain | ethers.js v6 on Sepolia |
| Encryption | eciesjs v0.4 |

## Features

| Feature | Description |
|---------|-------------|
| Wallet Management | Create or import a Sepolia wallet. Private key stored in Raycast preferences. |
| Balance Dashboard | View private vault balances and on chain token balances side by side. |
| Lend Intent | 5 step guided form: token, amount, rate, deposit confirmation, intent submission. |
| Borrow Intent | Form with collateral calculation based on credit tier and live ETH price. |
| Loan Portfolio | Unified view of all active, repaid, and defaulted loans. |
| Private Transfers | Send tokens to another shielded address within the vault. |
| Shielded Address | Generate and display the user's shielded vault address. |
| Withdrawals | Withdraw from vault shielded balance to on chain ERC20 balance. |
| Transaction History | View all historical transfers with reason codes and timestamps. |
| Credit Profile | Display credit tier, multiplier, loans repaid, and loans defaulted. |

## Views

The extension is organized into 12 view components:

### WalletView

Create a new wallet or import an existing one by entering a private key. The wallet is stored securely in Raycast's local storage.

### BalancesView

Displays two sections:
- **Private balances:** gUSD and gETH held in the shielded vault
- **On chain balances:** ERC20 token balances on Sepolia

Balances auto refresh on view open.

### LendFormView

A 5 step guided lending flow:

| Step | Input |
|------|-------|
| 1 | Select token (gUSD) |
| 2 | Enter lending amount |
| 3 | Enter desired interest rate (encrypted with CRE public key) |
| 4 | Confirm vault deposit and private transfer to pool |
| 5 | Submit lend intent with EIP 712 signature |

### BorrowFormView

Collateral is calculated automatically:

1. Enter borrow amount
2. Extension fetches credit tier and ETH price
3. Required collateral displayed (amount * multiplier / ethPrice)
4. Enter maximum acceptable rate
5. Submit with EIP 712 signature

### LendPositionsView and BorrowPositionsView

List views showing all active intents, pending proposals, and matched loans. Each item has actions for:
- Cancelling intents
- Accepting or rejecting proposals
- Viewing loan details

### MyLoansView

Unified loan dashboard with sections for active, repaid, and defaulted loans. Each loan shows:
- Principal and effective rate
- Collateral amount and current health factor
- Matched tick breakdown
- Repayment and claim actions

### TransferView

Form for executing private transfers within the vault. Enter recipient shielded address, token, and amount. Signed with EIP 712.

### WithdrawView

Withdraw from vault shielded balance to on chain. Requires a withdrawal ticket signed by the user.

### ProfileView

Displays the user's credit score:
- Current tier (Bronze, Silver, Gold, Platinum)
- Collateral multiplier for the tier
- Total loans repaid
- Total loans defaulted

## Hooks

Custom React hooks for data fetching:

| Hook | Purpose |
|------|---------|
| `useWallet` | Wallet state management and persistence |
| `useBalances` | Fetch private and on chain balances |
| `useLenderStatus` | Fetch lender positions and active intents |
| `useBorrowerStatus` | Fetch borrower positions, proposals, and loans |
| `useCreditScore` | Fetch credit tier and calculate multiplier |

## Library Modules

| Module | Purpose |
|--------|---------|
| `constants.ts` | Server URLs, contract addresses, EIP 712 type definitions |
| `ghost-api.ts` | GHOST server API client (all endpoints) |
| `external-api.ts` | Vault API client (deposits, transfers, withdrawals, balances) |
| `chain.ts` | On chain interactions (ERC20 balances, approvals) |
| `encryption.ts` | Rate encryption using eciesjs |
| `wallet.ts` | Local wallet creation, import, and storage |

## Running the Extension

### Development

```bash
cd ghost-raycast
npm install
ray develop
```

This opens the extension in Raycast's development mode with hot reload.

### Building

```bash
ray build
```

### Publishing

```bash
npx @raycast/api@latest publish
```

## Configuration

The extension uses hardcoded configuration in `constants.ts`:

| Constant | Value |
|----------|-------|
| `GHOST_SERVER_URL` | GHOST API base URL |
| `RPC_URL` | Sepolia RPC endpoint |
| `VAULT_ADDRESS` | Compliant Private Transfer vault address |
| `TOKEN_ADDRESS` | gUSD token address |
| `GETH_ADDRESS` | gETH token address |
| `CRE_PUBLIC_KEY` | CRE public key for rate encryption |

For local development, update these constants to point to your local server.
