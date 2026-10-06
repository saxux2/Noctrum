---
sidebar_position: 1
title: GhostVault Contract
---

# GhostVault Contract

The production architecture replaces the generic Chainlink Compliant Private Transfer vault with a purpose built `GhostVault` smart contract. This contract adds protocol specific logic for collateral locking, DON authorized fund movements, and on chain settlement verification.

:::note
The GhostVault is the production design target. The current implementation uses Chainlink's generic vault at `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13`.
:::

## Contract Responsibilities

| Function | Description |
|----------|-------------|
| `deposit(token, amount)` | Accept ERC20 deposits into the vault |
| `withdraw(token, amount)` | Allow withdrawals up to unlocked balance |
| `onReport(report, signatures)` | Process DON signed reports for fund movements |
| `lockedBalances[user][token]` | Track soft locked collateral and lend positions |

## Soft Locking Mechanism

The GhostVault introduces a `lockedBalances` mapping that prevents users from withdrawing funds that are committed to active protocol operations:

```solidity
mapping(address => mapping(address => uint256)) public lockedBalances;

function withdraw(address token, uint256 amount) external {
    uint256 available = balances[msg.sender][token] - lockedBalances[msg.sender][token];
    require(amount <= available, "Insufficient unlocked balance");
    // ... execute withdrawal
}
```

Locks are incremented when:
- A lender confirms a deposit (their lending amount is locked)
- A borrower submits a borrow intent (their collateral is locked)

Locks are decremented when:
- A lend intent is cancelled
- A borrow intent is cancelled
- A loan is repaid
- A loan is liquidated

Lock operations are executed via DON signed reports, ensuring that only the CRE (through threshold consensus) can modify lock state.

## DON Report Processing

The `onReport` function is the sole entry point for protocol authorized fund movements:

```solidity
function onReport(bytes calldata report, bytes[] calldata signatures) external {
    // Verify DON threshold signatures
    require(verifyDONSignatures(report, signatures), "Invalid DON signatures");

    // Decode and execute operations
    Operation[] memory ops = abi.decode(report, (Operation[]));
    for (uint i = 0; i < ops.length; i++) {
        executeOperation(ops[i]);
    }
}
```

Each operation can be:
- A private transfer between shielded addresses
- A lock/unlock of user balances
- A collateral seizure (for liquidations)

## EIP 712 Typed Data

The production contract defines typed data structures for each protocol action:

| Type | Fields | Purpose |
|------|--------|---------|
| `LendBid` | lender, token, amount, encryptedRate, nonce, deadline | Submit a lending position |
| `BorrowRequest` | borrower, token, amount, encryptedMaxRate, collateralToken, collateralAmount, nonce, deadline | Submit a borrow request |
| `CancelIntent` | user, intentId, nonce, deadline | Cancel a lend or borrow intent |

These typed data signatures are verified by the contract before forwarding to the CRE via the DON's HTTP proxy.

## Differences from Generic Vault

| Feature | Generic Vault | GhostVault |
|---------|--------------|------------|
| Collateral locking | Not supported | Native `lockedBalances` |
| Protocol specific operations | None | Lock, unlock, seize via DON report |
| Intent submission | Off chain only | On chain via EIP 712 + DON proxy |
| Withdrawal restrictions | None (full balance available) | Available = balance minus locked |
| Upgrade mechanism | N/A | UUPS proxy with timelock |
| Emergency controls | N/A | Granular pause, circuit breaker |

## Access Control

The contract uses a minimal access control model:

| Role | Held By | Permissions |
|------|---------|------------|
| Owner | Multisig (3/5) | Upgrade proxy, update DON config, emergency pause |
| DON | Chainlink DON address | Submit reports via `onReport` |
| Users | Any address | Deposit, withdraw (unlocked), sign typed data |

No admin can directly move user funds. All fund movements require valid DON signatures.
