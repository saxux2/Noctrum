---
sidebar_position: 2
title: Sealed Bid Auctions
---

# Sealed Bid Auctions

GHOST implements a sealed bid discriminatory price auction for interest rate discovery. This section explains the auction format, why it was chosen, and how it differs from common alternatives.

## Auction Format

In a standard open order book lending market, rates are visible to all participants. GHOST instead operates as a periodic sealed bid auction:

1. **Submission phase:** Lenders submit encrypted rate bids during an epoch window. Borrowers submit borrow intents with their maximum acceptable rate.
2. **Matching phase:** At the end of each epoch (every 30 seconds), the CRE decrypts all bids inside the TEE and runs the matching engine.
3. **Settlement phase:** Match proposals are posted to the server. Borrowers have a 5 second window (5 minutes in production) to accept or reject.

## Why Discriminatory Pricing

In a **uniform price auction**, all winning bidders pay the same clearing price (typically the highest accepted bid). In a **discriminatory price auction**, each winning bidder pays their own bid.

GHOST uses discriminatory pricing for several reasons:

| Property | Uniform Price | Discriminatory Price |
|----------|--------------|---------------------|
| Lender earnings | All earn the clearing rate | Each earns their individual bid |
| Free riding | Lenders can bid low knowing they earn the clearing rate | No free riding; bid equals payout |
| Rate information leakage | Clearing rate reveals market equilibrium | No single rate is published |
| Revenue to borrower | Generally higher | Generally lower (better for borrowers) |
| Strategic complexity | Bid shading (bid below true value) is optimal | Truthful bidding is approximately optimal |

The discriminatory format aligns with GHOST's privacy goals because there is no single clearing rate to publish. Each lender's rate remains private even after matching, since the borrower only sees the blended effective rate.

## Sealed Bid Properties

The sealed bid mechanism provides:

**Pre auction privacy.** No participant can observe pending bids before the matching epoch. This eliminates:
- Front running (submitting a marginally better bid after seeing a competitor's bid)
- Rate manipulation (artificially inflating or deflating rates to influence the clearing price)
- Sniping (waiting until the last moment to submit based on observed bids)

**Post auction privacy.** After matching, individual lender rates are not published. The borrower sees only:
- The list of matched lenders and their amounts
- The blended effective rate
- The total principal and collateral

Individual tick rates are visible only to the CRE during matching and to each lender for their own position.

## Epoch Based Execution

The matching engine runs on a fixed epoch schedule (configurable, default 30 seconds). All intents submitted during an epoch are processed together as a batch.

**Advantages of epoch batching:**
- Reduces timing information leakage (all intents in an epoch are treated equally)
- Enables global optimization (the matching engine sees all supply and demand simultaneously)
- Reduces CRE execution overhead (one matching run per epoch vs continuous processing)

**Trade off:**
- Borrowers may wait up to one epoch for a match
- Rate discovery latency is bounded by epoch length

## Comparison with Other Approaches

| Approach | Rate Privacy | MEV Resistance | Capital Efficiency |
|----------|-------------|---------------|-------------------|
| Open order book (Aave style) | None | Low | High (instant matching) |
| Commit reveal auction | During commit phase only | Medium | Medium (two phase delay) |
| GHOST sealed bid | Full (encrypted until CRE match) | High | Medium (epoch delay) |
| Frequent batch auction | None (rates visible) | High | Medium (batch delay) |

GHOST's approach uniquely combines rate privacy with MEV resistance. The commit reveal pattern achieves temporary privacy but reveals rates during the reveal phase. GHOST never reveals individual rates outside the TEE.
