---
sidebar_position: 2
title: On Chain Custody
---

# On Chain Custody

This page describes how fund custody works in both the current implementation and the production target.

## Current Implementation

The current version runs on Monad Testnet. Chainlink's Compliant Private Token (CPT) vault and API only exist on Ethereum Sepolia, so NOCTRUM self-hosts a wire-compatible pair: the `NoctrumVault` contract and the `noctrum-vault-api` private ledger service.

### Vault Details

| Property | Value |
|----------|-------|
| Contract Address | `0x65877F6BFd3f2D293454658BCb290b112397Eeb5` |
| Chain | Monad Testnet (10143) |
| Tokens | nUSD, nETH |
| Balance Model | Off chain (shielded balances kept by `noctrum-vault-api` in MongoDB) |
| Compliance | Chainlink ACE PolicyEngine checks on deposit, withdrawal and private transfer |

### Fund Flow

1. **Deposit.** User calls `deposit(token, amount)` (or `depositWithPermit`) on the vault contract. ERC20 tokens are transferred from user to vault. The vault API indexes the `Deposit` event once the block is finalized and credits the user's shielded balance.

2. **Private Transfer.** User (or CRE via pool wallet) calls the vault API endpoint `/private-transfer` with an EIP 712 signed request. The API debits the sender's shielded balance and credits the recipient's.

3. **Withdrawal.** User calls the vault API `/withdraw` with a signed request. The API debits the shielded balance and returns a withdrawal ticket signed by the vault's `ticketSigner` (valid 1 hour). The user redeems it on chain with `withdrawWithTicket(token, amount, ticket)`, which transfers the ERC20 tokens back. If the ticket expires unredeemed, the balance is credited back.

### Pool Wallet

The NOCTRUM protocol operates a pool wallet that acts as an intermediary for all protocol fund movements:

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

The production target extends the vault with protocol specific logic (see the NoctrumVault Contract page).

### Key Differences

| Aspect | Current | Production |
|--------|-----------|------------|
| Vault Contract | CPT-compatible NoctrumVault | NoctrumVault with locking and DON reports |
| Balance Model | Off chain shielded | On chain with Pedersen commitments (future) |
| Collateral Locking | In memory (server state) | On chain `lockedBalances` mapping |
| Fund Movement Auth | Pool wallet signature | DON threshold report |
| Intent Submission | Server API only | On chain via EIP 712 + DON proxy |
| Withdrawal Guard | None | Balance minus locked balance |

### State Location Map

| Data | Current Location | Production Location |
|------|-------------------|-------------------|
| User balances | Vault API ledger (off chain) + server | NoctrumVault contract |
| Collateral locks | Server in memory | NoctrumVault `lockedBalances` |
| Encrypted intents | Server MongoDB | Server MongoDB (unchanged) |
| Loan records | Server MongoDB | Server MongoDB + on chain summary hash |
| Credit scores | Server MongoDB | Server MongoDB (privacy sensitive) |
| Pending transfers | Server MongoDB | Not needed (DON reports replace queue) |

### Settlement Flow (Production)

In production, the CRE does not use the `execute-transfers` workflow at all. Instead:

1. CRE matches loans and generates a settlement report
2. The report is signed by DON threshold (multiple nodes)
3. The report is submitted to `NoctrumVault.onReport()`
4. The contract verifies signatures and executes all operations atomically
5. Fund movements, lock changes, and state updates happen in a single transaction

This eliminates the polling based transfer queue and provides atomic settlement guarantees.
