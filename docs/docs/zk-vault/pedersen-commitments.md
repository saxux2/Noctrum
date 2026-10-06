---
sidebar_position: 3
title: Pedersen Commitments
---

# Pedersen Commitments

The ASCV uses Pedersen commitments on the BN254 elliptic curve to represent balances and amounts on chain without revealing their values. This page explains the commitment scheme, its properties, and how it integrates with GHOST's protocol operations.

## Commitment Scheme

A Pedersen commitment to a value `v` with blinding factor `r` is:

```
C = v * G + r * H
```

Where:
- `G` is the standard generator of the BN254 curve
- `H` is a nothing up my sleeve point (hash to curve of a public seed)
- `v` is the secret value (balance, amount, rate)
- `r` is a random blinding factor known only to the committer

## Properties

| Property | Description | Relevance to GHOST |
|----------|-------------|-------------------|
| Hiding | Given `C`, an adversary cannot determine `v` without `r` | Balance amounts are hidden from on chain observers |
| Binding | The committer cannot open `C` to a different value | Users cannot claim a different balance than committed |
| Homomorphic | `C(a) + C(b) = C(a + b)` (with summed blinding factors) | Balance updates can be verified without decryption |
| Compact | Single curve point (32 bytes compressed) | Efficient on chain storage |

## Homomorphic Addition

The additive homomorphism is the key property that enables private balance updates:

```
C(balance_old) + C(transfer_amount) = C(balance_new)
```

Specifically:
```
(v1 * G + r1 * H) + (v2 * G + r2 * H) = (v1 + v2) * G + (r1 + r2) * H
```

This means the contract can verify that a transfer conserves value (no tokens created or destroyed) by checking:

```
C(sender_new) + C(recipient_new) + C(fee) = C(sender_old) + C(recipient_old)
```

Without knowing any of the actual amounts.

## BN254 Curve Choice

GHOST uses BN254 (also called alt_bn128) because:

| Reason | Detail |
|--------|--------|
| EVM precompile support | `ecAdd` (0x06), `ecMul` (0x07), `ecPairing` (0x08) are native EVM operations |
| Gas efficiency | Precompiled operations cost 150 to 45,000 gas vs millions for software implementation |
| Groth16 compatibility | BN254 is the standard curve for Groth16 verification in Solidity |
| snarkjs support | The ZK proof library used by the CRE natively supports BN254 |

## Hash Function

Inside ZK circuits, GHOST uses Poseidon hash instead of SHA 256 or Keccak:

| Hash | Constraints in Circuit | Use Case |
|------|----------------------|----------|
| Poseidon | ~240 | Nullifiers, Merkle trees, commitment derivation |
| SHA 256 | ~25,000 | Not used inside circuits |
| Keccak | ~150,000 | Not used inside circuits |

Poseidon is algebraically friendly (defined over the same field as BN254), resulting in 100x fewer constraints than traditional hash functions.

## Commitment Tree

All balance commitments are stored in a Merkle tree on chain:

```
         root
        /    \
      h01     h23
     /  \    /  \
   C0    C1  C2   C3
```

- Each leaf is a Pedersen commitment to a user's balance
- The tree uses Poseidon hash for internal nodes
- The current root is stored in the GhostVault contract
- ZK proofs include Merkle path witnesses to prove commitment membership

When a balance changes, the old commitment is nullified (using a deterministic nullifier) and a new commitment is inserted. This prevents double spending while maintaining privacy.

## Blinding Factor Management

Blinding factors are critical secrets that must be managed carefully:

| Actor | Blinding Factor Source | Storage |
|-------|----------------------|---------|
| Users | Generated client side (random 32 bytes) | User's local wallet or encrypted backup |
| CRE | Generated inside TEE for protocol operations | Ephemeral (discarded after proof generation) |
| Contract | Never sees blinding factors | N/A |

If a user loses their blinding factor, they cannot prove ownership of their balance commitment. Recovery requires a social recovery mechanism or backup.

## Gas Cost Estimates

On chain operations with Pedersen commitments on Ethereum L1:

| Operation | Estimated Gas |
|-----------|------------:|
| Deposit (mint commitment) | ~287,000 |
| Transfer (nullify + create) | ~284,000 |
| Match accept (multi commitment) | ~592,000 |
| Withdrawal (burn commitment) | ~250,000 |

On L2 (Arbitrum, Base), these costs are reduced by approximately 10 to 50x depending on the L2's fee model.

## Comparison with Alternatives

| Approach | Amount Privacy | Computation Cost | EVM Native |
|----------|--------------|-----------------|------------|
| Pedersen (BN254) | Full | Low (precompiles) | Yes |
| ElGamal | Full | Medium | No |
| Bulletproofs | Full (range proofs) | High | No |
| FHE | Full | Very high | No |
| Plaintext | None | Minimal | Yes |

Pedersen on BN254 offers the best balance of privacy, gas efficiency, and EVM compatibility for GHOST's use case.
