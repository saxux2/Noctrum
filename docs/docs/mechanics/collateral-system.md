---
sidebar_position: 4
title: Collateral System
---

# Collateral System

GHOST requires borrowers to post overcollateralized positions using a different token than the one being borrowed. The collateral amount is determined by the borrower's credit tier and the current market value of the collateral asset.

## Collateral Multiplier

The required collateral is calculated as:

```
requiredCollateral = (loanAmount * multiplier) / collateralPrice
```

Where `multiplier` depends on the borrower's credit tier:

| Credit Tier | Multiplier | Effective LTV |
|-------------|-----------|---------------|
| Bronze | 2.0x | 50% |
| Silver | 1.8x | 55.6% |
| Gold | 1.5x | 66.7% |
| Platinum | 1.2x | 83.3% |

New users start at Bronze tier. Tier progression is based on repayment history (see the Credit Tiers section).

## Collateral Validation

When a borrower submits a borrow intent, the server validates that the offered collateral meets the minimum requirement:

1. Fetch the borrower's credit tier from the credit score model
2. Look up the collateral multiplier for that tier
3. Fetch the current collateral token price (ETH/USD from Chainlink feeds)
4. Compute `requiredCollateral = (borrowAmount * multiplier) / ethPrice`
5. Reject if `offeredCollateral < requiredCollateral`

The borrower must have already deposited the collateral into the vault and transferred it to the GHOST pool before submitting the borrow intent.

## Supported Collateral Pairs

Currently, GHOST supports a single collateral pair:

| Borrow Token | Collateral Token | Price Feed |
|-------------|-----------------|------------|
| gUSD | gETH | Chainlink ETH/USD on Arbitrum |

The price feed is read by the CRE via the EVMClient using Chainlink Data Streams, ensuring that collateral valuations are tamper resistant.

## Collateral Lifecycle

### At Loan Creation

When a match proposal is accepted and a loan is created:
- The collateral remains in the GHOST pool (already transferred during borrow intent submission)
- The server records the `collateralAmount` and `requiredCollateral` on the loan
- The loan's health factor is initially above the liquidation threshold

### During Active Loan

While the loan is active:
- The CRE periodically checks the health factor via the `check-loans` workflow
- Health factor is computed as `(collateralAmount * currentEthPrice) / principal`
- If the collateral value drops, the health factor decreases
- Borrowers can claim excess collateral if their position is overcollateralized beyond the required amount

### At Repayment

When the borrower repays the loan in full:
- Principal plus interest is distributed to lenders (each at their tick rate)
- Full collateral is returned to the borrower via a queued transfer
- The borrower's credit tier may be upgraded

### At Liquidation

If the health factor falls below the liquidation threshold (1.5x):
- The loan is marked as defaulted
- 5% of collateral goes to the protocol as a liquidation fee
- 95% of collateral is distributed pro rata to lenders based on their tick amounts
- The borrower's credit tier is downgraded

## Excess Collateral Claims

If a borrower posted more collateral than required (for example, ETH price increased after loan creation), they can claim the excess via the `claim-excess-collateral` endpoint.

The claimable amount is computed as:

```
excess = collateralAmount - requiredCollateral
```

Where `requiredCollateral` is recalculated at the current ETH price. This allows borrowers to free up capital without repaying the loan.

## Soft Locking (Production)

In the production architecture, collateral is soft locked on chain via the `GhostVault` contract's `lockedBalances` mapping. This prevents borrowers from withdrawing locked collateral through the vault's normal withdrawal flow while still keeping the balance in their shielded address.

The locking mechanism uses a DON signed report to increment/decrement `lockedBalances[user][token]`. The vault's `withdraw` function checks that `balance - lockedBalances >= withdrawAmount`, ensuring locked funds cannot be extracted.
