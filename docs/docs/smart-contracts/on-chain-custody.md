---
sidebar_position: 2
title: On Chain Custody
---

# On Chain Custody

This page describes how fund custody works in both the current hackathon implementation and the production target.

## Current Implementation

The hackathon version uses Chainlink's generic Compliant Private Transfer vault deployed on Sepolia.

### Vault Details

| Property | Value |
|----------|-------|
| Contract Address | `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` |
| Chain | Ethereum Sepolia (11155111) |
| Tokens | gUSD, gETH |
| Balance Model | Off chain (shielded balances tracked by vault) |

### Fund Flow

1. **Deposit.** User calls `deposit(token, amount)` on the vault contract. ERC20 tokens are transferred from user to vault. The vault credits the user's shielded balance.

2. **Private Transfer.** User (or CRE via pool wallet) calls the vault's API endpoint `/private-transfer` with a signed request. The vault debits sender's shielded balance and credits recipient's.

3. **Withdrawal.** User calls the vault's API `/withdraw` with a signed request. The vault burns shielded balance and transfers ERC20 tokens back to the user's on chain address.

### Pool Wallet

The GHOST protocol operates a pool wallet that acts as an intermediary for all protocol fund movements:

- Lenders private transfer to the pool address when depositing
- The pool private transfers to borrowers when disbursing loans
- The pool private transfers to lenders when distributing repayments or liquidation proceeds
- The pool private transfers back to lenders or borrowers when cancellations occur

The pool wallet's private key is stored as a DON secret and used exclusively by the CRE's `execute-transfers` workflow.

### External API Integration

The server wraps vault API calls in `external-api.ts`:

```typescript
async function privateTransfer(params: {
  sender: string;
  senderSignature: string;
  recipient: string;
  token: string;
  amount: string;
}) {
  const response = await fetch(`${EXTERNAL_API_URL}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return response.json();
}
```

## Production Architecture

The production version replaces the generic vault with the GhostVault contract (see the GhostVault Contract page).

### Key Differences

| Aspect | Hackathon | Production |
|--------|-----------|------------|
| Vault Contract | Generic Chainlink vault | Custom GhostVault |
| Balance Model | Off chain shielded | On chain with Pedersen commitments (future) |
| Collateral Locking | In memory (server state) | On chain `lockedBalances` mapping |
| Fund Movement Auth | Pool wallet signature | DON threshold report |
| Intent Submission | Server API only | On chain via EIP 712 + DON proxy |
| Withdrawal Guard | None | Balance minus locked balance |

### State Location Map

| Data | Hackathon Location | Production Location |
|------|-------------------|-------------------|
| User balances | Vault (off chain) + server | GhostVault contract |
| Collateral locks | Server in memory | GhostVault `lockedBalances` |
| Encrypted intents | Server MongoDB | Server MongoDB (unchanged) |
| Loan records | Server MongoDB | Server MongoDB + on chain summary hash |
| Credit scores | Server MongoDB | Server MongoDB (privacy sensitive) |
| Pending transfers | Server MongoDB | Not needed (DON reports replace queue) |

### Settlement Flow (Production)

In production, the CRE does not use the `execute-transfers` workflow at all. Instead:

1. CRE matches loans and generates a settlement report
2. The report is signed by DON threshold (multiple nodes)
3. The report is submitted to `GhostVault.onReport()`
4. The contract verifies signatures and executes all operations atomically
5. Fund movements, lock changes, and state updates happen in a single transaction

This eliminates the polling based transfer queue and provides atomic settlement guarantees.
