---
sidebar_position: 1
title: Rejection Penalty
---

# Rejection Penalty

GHOST imposes a 5% collateral penalty on borrowers who reject match proposals. This mechanism prevents option seeking behavior and ensures that the matching engine's work translates into actual loans.

## The Problem

Without a rejection penalty, a rational borrower could:

1. Submit a borrow intent with a high maximum rate to maximize match probability
2. Receive a match proposal
3. Observe current market conditions externally
4. Reject the proposal if they find a better rate elsewhere
5. Repeat, using GHOST proposals as free options on rate discovery

This behavior wastes lender liquidity (their ticks are locked during the proposal window) and CRE compute resources (the matching engine runs for proposals that will be rejected).

## Penalty Mechanics

When a borrower rejects a match proposal:

1. **5% of collateral is slashed.** The slashed amount is transferred to the protocol pool as a fee.
2. **95% of collateral is returned.** The remaining collateral is queued as a transfer back to the borrower.
3. **Matched ticks are released.** All lend intents that were locked in the rejected proposal become available for the next matching epoch.
4. **The borrow intent is marked as rejected.** The borrower must submit a new intent to try again.

```
slashedAmount = collateralAmount * 0.05
returnAmount  = collateralAmount * 0.95
```

## Auto Acceptance

To prevent borrowers from passively ignoring proposals (which would lock lender liquidity indefinitely), proposals have a fixed expiration window:

- **Current implementation:** 5 seconds
- **Production target:** 5 minutes

If a proposal is not explicitly accepted or rejected within this window, the `expireProposals` internal endpoint auto accepts it. Auto acceptance:

1. Creates an active loan from the proposal
2. Consumes the matched lend ticks
3. Queues the principal disbursement transfer to the borrower
4. Does not trigger the rejection penalty

This means borrowers cannot avoid loans by simply ignoring proposals. They must actively reject and pay the penalty if they do not want the match.

## Incentive Analysis

The 5% penalty creates a cost for rejection that must be weighed against the benefit of finding a better rate elsewhere. For the penalty to be effective:

```
penaltyCost = 0.05 * collateralValue
rateBenefit = (proposedRate - alternativeRate) * principal * loanDuration
```

A borrower should reject only if `rateBenefit > penaltyCost`. For typical loan parameters (moderate duration, small rate differences), the penalty is large enough to discourage casual rejection while still allowing rejection when there is a genuinely significant rate difference.

## Implementation

The rejection flow is handled in the borrow controller:

```typescript
// From borrow.controllers.ts (simplified)
const slashAmount = (proposal.collateralAmount * 5n) / 100n;
const returnAmount = proposal.collateralAmount - slashAmount;

// Queue penalty to protocol
await queueTransfer({
  recipient: poolAddress,
  token: proposal.collateralToken,
  amount: slashAmount,
  reason: "cancel-borrow",
});

// Queue return to borrower
await queueTransfer({
  recipient: proposal.borrower,
  token: proposal.collateralToken,
  amount: returnAmount,
  reason: "cancel-borrow",
});
```
