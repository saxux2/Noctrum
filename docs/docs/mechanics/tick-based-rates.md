---
sidebar_position: 1
title: Tick Based Rate Discovery
---

# Tick Based Rate Discovery

GHOST uses a tick based rate model inspired by the framework in Eli and Alexandre (2025). Rather than a single pool rate, each lender specifies an individual rate "tick" at which they are willing to lend. This creates a discrete supply curve of available liquidity at different price points.

## Rate Tick Formalism

A tick pool is defined as a tuple `(r, A, f)` where:

- `r` is the interest rate (annualized, expressed as a decimal)
- `A` is the total amount of liquidity available at that rate
- `f` is the fill fraction, representing the proportion currently matched (0 to 1)

The available liquidity at any tick is `A * (1 - f)`. Multiple lenders can deposit at the same rate tick, in which case their amounts are aggregated.

## Supply Curve Construction

When the CRE decrypts all pending lend intents in an epoch, it constructs the supply curve by:

1. Decrypting each lend intent's encrypted rate
2. Sorting all lend intents by rate in ascending order (cheapest first)
3. Grouping intents at the same rate into a single tick

The result is a step function where each step represents a tick of available liquidity at a specific rate.

## Lender Utility

A lender who bids rate `r_b` for amount `A` with true valuation `r*` earns:

```
U(r_b) = f(r_b) * A * r_b
```

Where `f(r_b)` is the fill fraction at the bid rate. Since the auction is discriminatory (each lender earns their bid rate), the optimal strategy analysis shows:

- **Bidding below true valuation** (`r_b < r*`): Increases fill probability but reduces per unit earnings. The lender is "leaving money on the table."
- **Bidding above true valuation** (`r_b > r*`): Increases per unit earnings but reduces fill probability. The lender risks not being matched.
- **Bidding at true valuation** (`r_b = r*`): Balances fill probability against earnings. This is approximately optimal when the lender has limited information about other bids.

The sealed bid mechanism strengthens the truthful bidding incentive because lenders cannot observe competing bids before submitting.

## Borrower Rate Experience

Borrowers specify a maximum acceptable rate. The matching engine fills their demand starting from the cheapest available tick and moving up. The borrower's effective rate is the weighted average across all matched ticks:

```
effectiveRate = sum(tick_amount_i * tick_rate_i) / sum(tick_amount_i)
```

If the effective blended rate exceeds the borrower's maximum rate, the match is rejected and ticks are released.

## Example

Consider three lenders and one borrower:

| Lender | Amount | Rate |
|--------|--------|------|
| Alice | 5,000 gUSD | 3.5% |
| Bob | 10,000 gUSD | 4.0% |
| Carol | 8,000 gUSD | 5.0% |

A borrower requests 12,000 gUSD with a max rate of 4.5%.

**Matching process:**
1. Fill Alice's tick entirely: 5,000 at 3.5%
2. Fill 7,000 of Bob's tick: 7,000 at 4.0%
3. Total filled: 12,000 gUSD

**Effective borrower rate:** `(5000 * 0.035 + 7000 * 0.04) / 12000 = 3.79%`

This is below the 4.5% maximum, so the match succeeds. Alice earns 3.5% on her full 5,000. Bob earns 4.0% on 7,000 (his remaining 3,000 stays available). Carol is not matched.

## Rate Encryption

Rates are encrypted client side before submission:

```typescript
import { encrypt } from 'eciesjs';

const encryptedRate = encrypt(crePublicKeyHex, Buffer.from(rate.toString()));
```

The encrypted blob is stored on the server as the `encryptedRate` field of the lend intent. The CRE decrypts it during matching:

```typescript
import { decrypt } from 'eciesjs';

const rate = parseFloat(
  decrypt(crePrivateKeyHex, Buffer.from(encryptedRate, 'hex')).toString()
);
```

The CRE uses eciesjs v0.4 which compiles to WASM for execution inside the Chainlink DON runtime.
