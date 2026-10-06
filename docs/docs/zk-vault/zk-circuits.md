---
sidebar_position: 2
title: ZK Circuits
---

# ZK Circuits

The ASCV uses five zero knowledge circuits to verify protocol operations without revealing private inputs. The CRE generates proofs inside the TEE, and anyone can verify them on chain.

## Circuit Overview

| Circuit | Proof System | Constraints | Verify Gas | Purpose |
|---------|-------------|-------------|------------|---------|
| Transfer | Groth16 | ~25,000 | ~220K | Verify private balance transfer |
| Collateral Adequacy | Groth16 | ~30,000 | ~220K | Verify collateral meets tier requirement |
| Interest Calculation | Groth16 | ~20,000 | ~220K | Verify correct interest computation per tick |
| Liquidation | Groth16 | ~35,000 | ~220K | Verify health factor breach and collateral distribution |
| Rate Ordering | PLONK | Variable | ~300K | Verify correct rate sorting for matching |

## Transfer Circuit

Proves that a balance transfer is valid without revealing amounts.

**Public inputs:**
- `nullifier`: Unique identifier for the spent commitment
- `commitmentNew_sender`: New sender balance commitment
- `commitmentNew_recipient`: New recipient balance commitment
- `merkleRoot`: Current commitment tree root

**Private inputs (witness):**
- `amount`: Transfer amount
- `sender_balance_old`: Sender's previous balance
- `sender_blinding_old`: Sender's previous blinding factor
- `sender_blinding_new`: Sender's new blinding factor
- `recipient_balance_old`: Recipient's previous balance
- `recipient_blinding_new`: Recipient's new blinding factor
- `merklePath`: Merkle proof for sender's commitment

**Constraints verified:**
1. `sender_balance_old >= amount` (no overdraft)
2. `commitmentNew_sender = Pedersen(sender_balance_old - amount, sender_blinding_new)`
3. `commitmentNew_recipient = Pedersen(recipient_balance_old + amount, recipient_blinding_new)`
4. Merkle path verifies sender's old commitment exists in the tree
5. Nullifier is correctly derived (prevents double spending)

## Collateral Adequacy Circuit

Proves that a borrower's collateral meets the required ratio for their credit tier.

**Public inputs:**
- `collateralCommitment`: Commitment to collateral amount
- `loanCommitment`: Commitment to loan amount
- `tierMultiplier`: Required collateral multiplier (public, tier dependent)
- `priceCommitment`: Commitment to collateral price

**Private inputs:**
- `collateralAmount`: Actual collateral amount
- `loanAmount`: Actual loan amount
- `collateralPrice`: Current price of collateral asset
- Blinding factors for all commitments

**Constraints verified:**
1. `collateralAmount * collateralPrice >= loanAmount * tierMultiplier`
2. All commitments are correctly formed
3. Price is within a valid range (sanity check)

## Interest Calculation Circuit

Proves that interest was computed correctly for each matched tick.

**Public inputs:**
- `totalOwedCommitment`: Commitment to total amount owed
- `tickCommitments[]`: Commitments to each tick's principal and rate

**Private inputs:**
- `tickAmounts[]`: Individual tick amounts
- `tickRates[]`: Individual tick rates
- `duration`: Loan duration in days
- Blinding factors

**Constraints verified:**
1. For each tick: `tickInterest = tickAmount * tickRate * duration / 365`
2. `totalOwed = sum(tickAmount + tickInterest)` for all ticks
3. Commitment to total owed is correctly formed

## Liquidation Circuit

Proves that a liquidation is justified and collateral distribution is correct.

**Public inputs:**
- `loanCommitment`: Commitment to loan principal
- `collateralCommitment`: Commitment to collateral amount
- `priceCommitment`: Commitment to current price
- `distributionCommitments[]`: Commitments to each lender's share

**Private inputs:**
- `principal`: Loan principal
- `collateralAmount`: Collateral amount
- `currentPrice`: Current collateral price
- `liquidationThreshold`: Health factor threshold
- `tickAmounts[]`: Each lender's tick amount
- Blinding factors

**Constraints verified:**
1. `(collateralAmount * currentPrice) / principal < liquidationThreshold` (health breach)
2. Protocol fee = 5% of collateral
3. Each lender share = `(tickAmount / totalPrincipal) * 95% * collateral`
4. Sum of distributions = collateral (conservation)

## Rate Ordering Circuit

Proves that the CRE sorted rates correctly during matching. Uses PLONK because the number of ticks varies per match.

**Public inputs:**
- `sortedRateCommitments[]`: Commitments to the sorted rate array
- `matchResult`: Hash of the matching outcome

**Private inputs:**
- `rates[]`: Actual decrypted rates
- `sortPermutation[]`: The permutation that sorts rates ascending
- Blinding factors

**Constraints verified:**
1. Applying `sortPermutation` to `rates` produces a sorted array
2. Each rate commitment matches the corresponding rate
3. The matching outcome is consistent with the sorted order

## Proof Systems

### Groth16

Used for circuits with fixed structure (Transfer, Collateral, Interest, Liquidation):

| Property | Value |
|----------|-------|
| Proof size | 128 bytes (3 group elements) |
| Verification gas | ~220,000 |
| Setup | Trusted setup per circuit (powers of tau + circuit specific) |
| Prover time | ~2 seconds (BN254, server grade hardware) |

### PLONK

Used for the Rate Ordering circuit which has variable tick counts:

| Property | Value |
|----------|-------|
| Proof size | ~500 bytes |
| Verification gas | ~300,000 |
| Setup | Universal setup (reusable across circuits) |
| Prover time | ~3 to 5 seconds |

## CRE as Proof Engine

The CRE generates all ZK proofs inside the TEE:

1. CRE decrypts rates and runs matching (same as current design)
2. CRE computes witness values for the relevant circuits
3. CRE generates Groth16/PLONK proofs using snarkjs (WASM compatible)
4. CRE bundles proofs into a DON report
5. DON signs the report (threshold signature)
6. Report is submitted to GhostVault.onReport()
7. Contract verifies all proofs before executing operations

This means the CRE is a "trusted but verified" prover. It generates proofs, but anyone can check them on chain.
