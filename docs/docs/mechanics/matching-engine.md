---
sidebar_position: 3
title: Matching Engine
---

# Matching Engine

The matching engine is the core algorithm that runs inside the CRE to pair lenders with borrowers. It implements a greedy fill strategy that optimizes for borrower cost while respecting individual rate constraints.

## Algorithm Overview

The matching engine runs once per epoch with the following steps:

1. Fetch all pending lend intents and borrow intents from the server
2. Decrypt each lend intent's encrypted rate
3. Sort lend intents by rate ascending (cheapest first)
4. Sort borrow intents by amount descending (largest demand first)
5. For each borrow intent, greedily fill from cheapest available ticks
6. Validate that the blended rate does not exceed the borrower's maximum
7. Generate match proposals for valid matches

## Greedy Fill Algorithm

```
For each borrow intent B (sorted by amount descending):
  matched_ticks = []
  remaining = B.amount

  For each lend intent L (sorted by rate ascending):
    if remaining <= 0: break
    if L.available <= 0: continue

    fill = min(remaining, L.available)
    matched_ticks.append({ lender: L, amount: fill, rate: L.rate })
    remaining -= fill
    L.available -= fill

  if remaining > 0:
    // Insufficient liquidity, skip this borrower
    release all matched_ticks
    continue

  effective_rate = weighted_average(matched_ticks)

  if effective_rate > B.maxRate:
    // Blended rate too expensive for borrower
    release all matched_ticks
    continue

  emit MatchProposal(B, matched_ticks, effective_rate)
```

## Complexity

The algorithm has time complexity `O(|B| * |L|)` where `|B|` is the number of borrow intents and `|L|` is the number of lend intents. In practice, the inner loop terminates early once a borrow is fully filled, so the average case is significantly better.

## Sorting Rationale

**Borrows sorted largest first.** Larger borrows are harder to fill because they consume more liquidity across multiple ticks. Processing them first ensures they get access to the cheapest rates before smaller borrows fragment the supply.

**Lends sorted cheapest first.** This ensures borrowers always get the best available rates. Combined with discriminatory pricing, this means each lender earns their bid rate while borrowers pay the minimum blended rate.

## Match Proposal Structure

When the engine produces a valid match, it generates a proposal with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `proposalId` | string | Unique identifier for this proposal |
| `borrowIntentId` | string | Reference to the original borrow intent |
| `borrower` | address | Borrower's Ethereum address |
| `token` | address | The lending token (e.g., gUSD) |
| `principal` | BigInt | Total matched amount |
| `matchedTicks` | array | List of `{ lender, lendIntentId, amount, rate }` |
| `effectiveBorrowerRate` | number | Weighted average rate across all ticks |
| `collateralToken` | address | The collateral token (e.g., gETH) |
| `collateralAmount` | BigInt | Total collateral posted by borrower |
| `status` | string | Initially `pending` |
| `expiresAt` | timestamp | Deadline for borrower acceptance |

## Tick Locking

When lend intents are included in an active (pending) match proposal, they are excluded from subsequent matching rounds. The server's `getPendingIntents` endpoint filters out lend intents that are currently locked in proposals. This prevents double matching.

If a proposal is rejected or expires, the locked ticks are released back to the available pool for the next epoch.

## Edge Cases

**Partial fills.** A single lend intent can be partially consumed by a match. The remaining amount stays available for future matching. This means a lender's 10,000 gUSD at 4% could be split across multiple borrowers.

**Insufficient liquidity.** If total available lending liquidity cannot cover a borrow intent, that borrow is skipped entirely. No partial borrowing is allowed (a borrower either gets their full amount or nothing).

**Rate ceiling breach.** If filling a borrow from cheapest ticks results in a blended rate above the borrower's maximum, the match is discarded and all ticks are released. The engine does not attempt to find a subset that would satisfy the rate constraint.

## Epoch Lifecycle

```
t=0s   Epoch opens. New intents accumulate on server.
t=30s  CRE triggers. Calls expireProposals() then getPendingIntents().
       Decrypts rates, runs matching, posts proposals.
t=30s  Proposals visible to borrowers. 5 second acceptance window.
t=35s  Unaccepted proposals auto-accept via expireProposals().
t=60s  Next epoch. Cycle repeats.
```

The auto acceptance mechanism (described in the Incentive Design section) ensures that proposals are never left in limbo indefinitely.
