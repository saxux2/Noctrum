---
sidebar_position: 2
title: Credit Tiers
---

# Credit Tiers

GHOST implements an endogenous credit scoring system that rewards good repayment behavior with lower collateral requirements. This creates a progression path where responsible borrowers gain increasing capital efficiency over time.

## Tier Schedule

| Tier | Collateral Multiplier | Effective LTV | Upgrade Threshold | Downgrade Trigger |
|------|----------------------|---------------|-------------------|-------------------|
| Bronze | 2.0x | 50% | Default starting tier | N/A |
| Silver | 1.8x | 55.6% | Successful repayment from Bronze | Loan default from Silver |
| Gold | 1.5x | 66.7% | Successful repayment from Silver | Loan default from Gold |
| Platinum | 1.2x | 83.3% | Successful repayment from Gold | Loan default from Platinum |

## Tier Progression

### Upgrade Path

Each successful loan repayment moves the borrower up one tier:

- Bronze to Silver after first repayment
- Silver to Gold after second consecutive repayment
- Gold to Platinum after third consecutive repayment

The upgrade is applied immediately when the repayment is processed. The server's `upgradeTier` function handles the progression:

```typescript
const tierOrder = ["bronze", "silver", "gold", "platinum"];
const currentIndex = tierOrder.indexOf(score.tier);
if (currentIndex < tierOrder.length - 1) {
  score.tier = tierOrder[currentIndex + 1];
}
score.loansRepaid += 1;
```

### Downgrade Path

Each loan default moves the borrower down one tier:

- Platinum to Gold on default
- Gold to Silver on default
- Silver to Bronze on default
- Bronze stays at Bronze (cannot go lower)

The downgrade is applied when the liquidation is processed:

```typescript
const tierOrder = ["bronze", "silver", "gold", "platinum"];
const currentIndex = tierOrder.indexOf(score.tier);
if (currentIndex > 0) {
  score.tier = tierOrder[currentIndex - 1];
}
score.loansDefaulted += 1;
```

## Credit Score Model

Each user's credit score is stored with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `address` | string | User's Ethereum address (lowercased) |
| `tier` | string | Current tier: bronze, silver, gold, or platinum |
| `loansRepaid` | number | Total count of successfully repaid loans |
| `loansDefaulted` | number | Total count of defaulted loans |

New users are initialized with `{ tier: "bronze", loansRepaid: 0, loansDefaulted: 0 }` on their first interaction.

## Economic Impact

The tier system creates meaningful economic incentives:

**For a 10,000 gUSD loan at ETH price $2,000:**

| Tier | Required Collateral | ETH Required | Capital Freed vs Bronze |
|------|--------------------:|-------------:|------------------------:|
| Bronze | $20,000 | 10.0 ETH | Baseline |
| Silver | $18,000 | 9.0 ETH | 1.0 ETH ($2,000) |
| Gold | $15,000 | 7.5 ETH | 2.5 ETH ($5,000) |
| Platinum | $12,000 | 6.0 ETH | 4.0 ETH ($8,000) |

A Platinum borrower locks 40% less collateral than a Bronze borrower for the same loan. This capital efficiency gain represents a significant incentive for building a positive repayment history.

## Design Rationale

**Why endogenous credit scoring?** Unlike traditional credit scores that rely on off chain identity and historical data, GHOST's credit system is entirely on protocol. This preserves pseudonymity (no KYC needed for tier progression) while still rewarding responsible behavior.

**Why single step progression?** Requiring one repayment per tier upgrade (rather than, say, five) keeps the system responsive while still creating meaningful friction. A borrower must complete at least three successful loans to reach Platinum.

**Why symmetric downgrade?** Defaulting drops you one tier rather than resetting to Bronze. This ensures that established borrowers are not catastrophically punished for a single adverse event (such as a flash crash causing liquidation).

## Querying Credit Score

The credit score is publicly queryable:

```
GET /api/v1/credit-score/:address
```

Returns the user's current tier, total repaid count, and total default count. This endpoint does not require authentication.
