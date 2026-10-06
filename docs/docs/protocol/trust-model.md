---
sidebar_position: 2
title: Trust Model
---

# Trust Model

GHOST's security relies on separating trust across multiple independent boundaries. No single entity has full control over user funds, rate data, and matching logic simultaneously.

## Trust Boundaries

| Boundary | What It Trusts | What It Guarantees |
|----------|---------------|-------------------|
| On Chain Vault | DON threshold signatures, ERC20 safety | Funds move only via user action or valid DON report |
| CRE (TEE) | Chain state integrity, TEE isolation, threshold secret management | Sealed rates visible only inside TEE; key material wiped after execution |
| GHOST Server | Nothing (it is a blob store) | No guarantees; compromised server cannot read rates or move funds |
| Users | Contract enforces fund safety, CRE runs fair matching, TEE preserves rate privacy | N/A |

## What Each Layer Can and Cannot Do

### The On Chain Vault

**Can do:**
- Hold and release user funds based on valid signatures
- Verify DON threshold signatures before executing transfers
- Track shielded balances with cryptographic proofs

**Cannot do:**
- Read encrypted rate bids
- Determine which transfers are related to lending vs borrowing
- Distinguish between different GHOST protocol operations

### The CRE

**Can do:**
- Decrypt all sealed rate bids within the TEE
- Run the matching engine and determine optimal pairings
- Sign private transfer requests using the pool wallet key (stored as DON secret)
- Read Chainlink price feeds for collateral health monitoring

**Cannot do:**
- Persist decrypted rates beyond a single execution cycle
- Move funds without going through the vault's signature verification
- Modify the matching algorithm without redeployment (code is immutable per workflow version)

### The GHOST Server

**Can do:**
- Store encrypted intents, proposals, loans, and balances
- Serve data to authenticated CRE requests
- Queue transfers for CRE execution
- Verify EIP 712 signatures on user requests

**Cannot do:**
- Decrypt any encrypted rate bid (no access to CRE private key)
- Execute fund transfers (no access to pool wallet private key)
- Modify matching outcomes (matching runs entirely within CRE)
- Fabricate valid EIP 712 signatures

## Attack Scenarios

### Compromised Server

If an attacker gains full control of the GHOST server:

- They can read encrypted rate blobs but cannot decrypt them
- They can see loan amounts, collateral, and addresses (this is the storage layer)
- They cannot move user funds (no pool wallet key)
- They cannot alter matching outcomes (CRE reconstructs state each epoch)
- They could censor intents by refusing to serve them to CRE, causing a liveness failure but not a safety failure

**Mitigation:** Users can verify their intents were included by checking CRE execution logs.

### Compromised CRE Node

The CRE operates under DON threshold assumptions. A single compromised node cannot:

- Reconstruct the full CRE private key (threshold secret sharing)
- Unilaterally sign transfer requests (threshold signature required)
- Leak decrypted rates (TEE memory isolation)

A full DON compromise (majority of nodes) would expose plaintext rates and enable unauthorized transfers. This is the strongest trust assumption in the system.

### Compromised Vault

If the vault smart contract has a vulnerability:

- User funds could be at risk
- The privacy layer (CRE + server) remains intact
- Rate bids remain encrypted and matching continues to work

**Mitigation:** The vault is a Chainlink maintained infrastructure component with independent audit and security guarantees.

## Stateless CRE Execution

In the production architecture, CRE workflows are fully stateless. Each execution cycle:

1. Fetches current state from the server
2. Fetches on chain state from the vault contract
3. Runs computation (matching, health checks, transfers)
4. Writes results back to server and/or chain
5. Discards all in memory state

This means the CRE has no persistent attack surface. There is no database, no cache, and no session state that could be targeted between executions.
