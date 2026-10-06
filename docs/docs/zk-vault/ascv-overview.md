---
sidebar_position: 1
title: ASCV Overview
---

# Application Specific Confidential Vault

The ASCV (Application Specific Confidential Vault) is the next generation architecture for GHOST. It replaces the generic Chainlink vault with a purpose built system that uses zero knowledge proofs to achieve full amount privacy, address privacy, and verifiable computation.

:::note
The ASCV is a future design target. The current implementation uses Chainlink's generic vault with off chain balance tracking.
:::

## Why a Custom Vault

The generic Chainlink Compliant Private Transfer vault provides basic shielded balance tracking but lacks several features that GHOST needs for production:

| Limitation | Impact | ASCV Solution |
|-----------|--------|--------------|
| No collateral locking primitive | Collateral locks are tracked in server memory, creating a trust dependency | On chain Pedersen commitments with ZK lock proofs |
| No on chain verifiability of matching | Users must trust CRE executed matching correctly | ZK proofs of correct rate ordering and fill |
| Amount visibility to vault operator | The vault operator can see all balances and transfers | Pedersen commitments hide amounts; only ZK proofs verify correctness |
| No stealth addresses | Recipient addresses are visible in transfer records | Elliptic curve Diffie Hellman stealth addresses |
| No liquidation hooks | Liquidation requires external trigger and fund movement | On chain liquidation with ZK collateral adequacy proof |

## Architecture Layers

The ASCV introduces four smart contracts:

| Contract | Purpose |
|----------|---------|
| `GhostVault` | Core vault: deposits, withdrawals, commitment storage, proof verification |
| `CollateralManager` | Collateral locking, health factor verification, liquidation execution |
| `LoanLedger` | Loan lifecycle tracking with privacy preserving records |
| `GhostRouter` | Entry point that coordinates operations across contracts |

All contracts use the UUPS proxy pattern with a 48 hour timelock and 3/5 multisig for upgrades.

## Privacy Properties

| Property | Mechanism |
|----------|-----------|
| Amount privacy | Pedersen commitments: `C = v*G + r*H` where `v` is amount, `r` is blinding factor |
| Address privacy | Stealth addresses via ECDH key exchange |
| Rate privacy | ECIES encryption (unchanged from current design) |
| Computation privacy | ZK proofs verify CRE executed correctly without revealing inputs |
| Compliance privacy | ZK KYC proofs verify eligibility without revealing identity |

## Trust Model Comparison

| Entity | Current Trust | ASCV Trust |
|--------|--------------|-----------|
| Server | Stores amounts in plaintext (but cannot move funds) | Stores only commitments and ciphertexts |
| CRE | Trusted for correct matching (not verifiable) | Generates ZK proofs that anyone can verify |
| Vault | Operator sees all balances | Only commitments visible; amounts hidden |
| Users | Trust CRE for fair matching | Can verify matching proofs on chain |

The ASCV shifts from "trust CRE" to "verify CRE" for matching correctness, while maintaining CRE as the computation engine that generates proofs.

## Transition Strategy

The migration from the current architecture to ASCV follows a phased approach:

| Phase | Description | Duration |
|-------|-------------|----------|
| Phase 1: Parallel | Deploy ASCV alongside existing vault. New deposits go to ASCV. | 4 weeks |
| Phase 2: Parity | Both systems operational. Verify ASCV correctness under production load. | 4 weeks |
| Phase 3: Migration | Migrate existing positions from old vault to ASCV. | 2 weeks |
| Phase 4: Standalone | Decommission old vault. ASCV is sole custody layer. | Ongoing |

During Phase 1 and 2, the CRE operates dual workflows: one for the old vault and one for ASCV.
