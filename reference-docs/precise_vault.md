# GHOST Vault: Application-Specific Confidential Vault (ASCV)

**Version 0.1 | March 2026 | Proposed to Chainlink Engineering**

---

## 1. Problem Statement

GHOST Protocol uses Chainlink's `DemoCompliantPrivateTokenVault` for all fund custody. That vault is a general-purpose ERC20 escrow — it has zero awareness of lending. Every privacy guarantee depends on an off-chain API operator, not cryptography.

| Problem | Impact |
|---------|--------|
| No collateral locking on-chain | Borrower can withdraw collateral anytime; enforcement is trust-based |
| No loan records on-chain | Loans exist only in server memory; zero verifiability |
| No liquidation hooks | CRE liquidates via HTTP POST, not enforceable on-chain |
| Balance privacy is custodial | Off-chain API operator can fabricate or leak balances |
| No interest verification | Interest math is server-side only; lenders cannot verify |
| Single immutable withdrawal signer | No key rotation, no multisig, no upgrade path |

**Proposal:** Replace with a ZK-verified, lending-native vault where privacy is enforced by math, not trust.

---

## 2. Current vs Proposed: Side-by-Side

| Dimension | Current (`DemoCompliantPrivateTokenVault`) | Proposed (`GhostVault`) |
|-----------|------------------------------------------|------------------------|
| **Balance Privacy** | Off-chain API tracks balances (trusted operator) | On-chain Pedersen commitments verified by SNARKs |
| **Transfer Privacy** | Off-chain API hides sender/recipient/amount | On-chain: only nullifiers + commitments visible |
| **Collateral Custody** | Server tracks in memory Map | Smart contract lock — cannot be bypassed |
| **Liquidation** | CRE POSTs to server HTTP endpoint | On-chain ZK proof of undercollateralization |
| **Interest Verification** | Server computes, no verification possible | SNARK proves repayment covers principal + interest |
| **Matching Fairness** | Trust CRE completely | SNARK proves sorted cheapest-first, blended rate valid |
| **Withdrawal Auth** | Single immutable `I_WITHDRAW_TICKET_SIGNER` | ZK proof of note ownership (no trusted signer) |
| **Upgradeability** | None (no proxy) | UUPS proxy, 48h timelock, 3/5 multisig |
| **Compliance** | PolicyEngine on deposit/withdraw | Same + ZK-KYC attestations for private transfers |
| **Fund Freeze Risk** | API operator can freeze funds | Users generate proofs client-side; funds never freeze |
| **On-Chain Footprint** | ~80K gas deposit, 0 gas transfer | ~287K gas deposit, ~284K gas transfer |

---

## 3. Architecture Overview

```
CLIENT (Next.js)                     ON-CHAIN                          CRE (Chainlink DON)
 - ECIES rate encryption              GhostVault.sol                    - Rate decryption
 - SNARK proof gen (snarkjs WASM)       Commitment Merkle tree           - Matching engine
 - Stealth address derivation           Nullifier set                   - ZK proof generation
 - EIP-712 signing                      SNARK verifiers                 - DON attestations
        |                              CollateralManager.sol             - Pool note management
        |                               Lock / Release / Liquidate       |
        +------- proofs + sigs ------> LoanLedger.sol         <---------+
                                        Loan records + interest          |
                                       GhostRouter.sol                   |
                                        Atomic CRE entry point  <--------+
                                       ACEHook.sol
                                        PolicyEngine compliance
```

**Key insight:** CRE evolves from "API caller" to "proof engine." It generates ZK proofs inside confidential compute that are verified on-chain. CRE cannot cheat (proofs are verified), but it can still decrypt rates (confidential compute).

---

## 4. Smart Contracts

### 4.1 Contract Summary

| Contract | Role | Proxy | State |
|----------|------|-------|-------|
| **GhostVault.sol** | Core vault: deposit, transfer, withdraw via ZK proofs | UUPS | Merkle root, nullifier set, leaf index |
| **CollateralManager.sol** | Lock/release/seize collateral for loans | UUPS | Locked notes mapping, circuit breaker |
| **LoanLedger.sol** | On-chain loan records with privacy | UUPS | Loan records (hashed borrower, committed amounts) |
| **GhostRouter.sol** | CRE orchestrator for atomic multi-contract ops | Immutable | None (stateless) |
| **ACEHook.sol** | Compliance wrapper for Chainlink PolicyEngine | Immutable | None (delegates to PolicyEngine) |
| **Groth16Verifier.sol** (x5) | One per ZK circuit | Immutable | None |
| **InterestAccrual.sol** | Pure math library | Library | None |

### 4.2 GhostVault.sol — Core Interface

```solidity
interface IGhostVault {
    // Deposit ERC20, create Pedersen commitment on-chain
    function deposit(
        address token,
        uint256 amount,
        bytes32 commitment,          // Pedersen(owner, token, amount, salt)
        bytes   calldata encNote,    // ecies(CRE_pubkey, note_preimage)
        bytes   calldata proof       // SNARK: commitment is well-formed
    ) external;

    // Private transfer: spend old notes, create new notes
    function transfer(
        bytes32[] calldata nullifiers,
        bytes32[] calldata newCommitments,
        bytes[]   calldata encNotes,
        bytes32   merkleRoot,
        bytes     calldata proof     // SNARK: valid spend + balance conservation
    ) external;

    // Withdraw: burn note, release ERC20
    function withdraw(
        bytes32 nullifier,
        address recipient,
        address token,
        uint256 amount,
        bytes32 merkleRoot,
        bytes   calldata proof       // SNARK: note exists, owned by caller
    ) external;
}
```

### 4.3 CollateralManager.sol — Lending Primitives

```solidity
interface ICollateralManager {
    // CRE locks collateral on match accept (note cannot be spent until released)
    function lockCollateral(
        bytes32 loanHash,
        bytes32 noteCommitment,
        bytes   calldata attestation    // DON threshold signature
    ) external;

    // CRE releases on full repayment
    function releaseCollateral(
        bytes32 loanHash,
        bytes   calldata attestation
    ) external;

    // CRE liquidates with ZK proof of undercollateralization
    function liquidate(
        bytes32 loanHash,
        bytes32 priceAttestation,       // DON-signed ETH/USD
        bytes   calldata proof,         // SNARK: health < threshold
        bytes   calldata attestation
    ) external;

    // Safety: max N liquidations per hour
    function setCircuitBreaker(uint16 maxPerHour) external;
}
```

### 4.4 LoanLedger.sol — Privacy-Preserving Loan Records

```solidity
struct LoanRecord {
    bytes32 borrowerHash;            // keccak256(borrower) — not raw address
    bytes32 principalCommitment;     // Pedersen commitment (amount hidden)
    bytes32 collateralCommitment;    // Pedersen commitment (amount hidden)
    uint32  aggregateRateBps;        // Blended rate only (individual rates hidden)
    uint32  maturity;                // Unix timestamp
    uint8   status;                  // 0=active, 1=repaid, 2=defaulted
    uint8   tickCount;               // Number of matched lenders
}
// Packed into 5 storage slots (160 bytes)
```

What's on-chain vs what's hidden:

| Data Point | On-Chain | Hidden |
|------------|----------|--------|
| Loan exists | Yes (loanHash) | — |
| Borrower identity | Hashed only | Real address |
| Principal amount | Pedersen commitment | Plaintext value |
| Collateral amount | Pedersen commitment | Plaintext value |
| Aggregate blended rate | Yes | — |
| Individual lender rates | No | Only CRE knows |
| Maturity date | Yes | — |
| Number of lenders | Yes | — |
| Lender identities | No | Only CRE knows |

### 4.5 GhostRouter.sol — Atomic CRE Operations

CRE calls one function per lifecycle event. All sub-operations succeed or all revert.

| Function | What It Does Atomically |
|----------|------------------------|
| `onMatchAccepted(...)` | Lock collateral + create loan + disburse principal |
| `onRepayment(...)` | Verify interest proof + mark repaid + release collateral + pay lenders |
| `onLiquidation(...)` | Verify liquidation proof + seize collateral + mark defaulted + redistribute |

---

## 5. Zero-Knowledge Proof Layer

### 5.1 Commitment Scheme

**Pedersen commitments on BN254** (Ethereum native precompiles):

```
C(v, r) = v * G + r * H

G, H  = BN254 G1 generators (H = HashToCurve(G), nobody knows log_G(H))
v     = balance value
r     = random blinding factor
```

Properties used:
- **Hiding:** Cannot determine `v` from `C` without `r`
- **Binding:** Cannot find different `(v', r')` that opens to same `C`
- **Homomorphic:** `C(a) + C(b) = C(a+b)` — enables balance updates without revealing amounts

**Note structure:**
```
Note = { owner, token, amount, salt }
commitment = Poseidon(owner, token, amount, salt)
nullifier  = Poseidon(spending_key, leaf_index, nonce)
```

Poseidon hash: ~240 R1CS constraints (vs ~25,000 for SHA-256). 8x cheaper in ZK circuits.

### 5.2 Five ZK Circuits

| # | Circuit | Purpose | Constraints | Proof System | Proof Size | Verify Gas | Prover |
|---|---------|---------|-------------|-------------|------------|------------|--------|
| 1 | **Transfer** | Prove valid spend + balance conservation | ~28K | Groth16 | 128 B | 220K | CRE or Client |
| 2 | **Collateral Adequacy** | Prove `collateral * price >= principal * tier_multiplier` | ~15K | Groth16 | 128 B | 220K | CRE |
| 3 | **Interest Calculation** | Prove repayment covers `sum(tick_i * (1 + rate_i))` | ~20K (10 ticks) | PLONK | 500 B | 300K | CRE |
| 4 | **Liquidation** | Prove `health_ratio < liquidation_threshold` | ~15K | Groth16 | 128 B | 220K | CRE |
| 5 | **Rate Ordering** | Prove matching: sorted cheapest-first, blended <= maxRate | ~16K (10 ticks) | PLONK | 500 B | 300K | CRE |

**Circuit 5 is novel.** No existing ZK protocol proves lending-specific matching fairness.

### 5.3 What Each Circuit Proves

**Transfer:** "I own a note in the Merkle tree with sufficient balance. I'm spending it to create new notes. Total in = total out. No double-spend (nullifier is fresh)."

**Collateral Adequacy:** "My collateral's USD value (at oracle price) exceeds the required amount for my credit tier. You don't learn my balance, my tier, or the multiplier."

**Interest Calculation:** "This repayment covers principal + accrued interest across N lender ticks, each at their discriminatory rate. You don't learn individual rates."

**Liquidation:** "This loan's collateral-to-debt ratio is below the threshold at the current oracle price. Seizure is justified."

**Rate Ordering:** "CRE matched lends cheapest-first, the blended rate is a valid weighted average, and it doesn't exceed the borrower's encrypted max rate. Matching was fair."

### 5.4 Proof System Choice

| Criteria | Groth16 | PLONK | STARKs |
|----------|---------|-------|--------|
| Proof size | 128 B | 400-500 B | 40-200 KB |
| Verify gas | ~220K | ~300K | 300K-1.5M |
| Trusted setup | Per-circuit | Universal | None |
| Variable inputs | No | Yes (PLookup) | Yes |
| Recursion | Limited | Good | Good |

**Decision:** Groth16 for fixed circuits (Transfer, Collateral, Liquidation). PLONK for variable-tick circuits (Interest, Rate Ordering).

---

## 6. CRE as Trusted-but-Verified Prover

### 6.1 Trust Reduction

| Operation | Current Trust | With ZK |
|-----------|--------------|---------|
| Matching | CRE says "match is fair" — no verification | CRE produces rate-ordering SNARK — on-chain verification |
| Liquidation | CRE says "loan is unhealthy" — server trusts blindly | CRE produces liquidation SNARK — contract verifies before seizing |
| Disbursement | CRE signs EIP-712 to external API — API trusts | CRE produces transfer SNARK — contract verifies before moving funds |
| Interest | Server computes — lenders trust blindly | CRE produces interest SNARK — verifiable on-chain |
| Collateral check | Server checks in plaintext | SNARK proves adequacy without revealing amounts |

### 6.2 Fallback Without CRE

| Operation | CRE Online | CRE Offline |
|-----------|-----------|-------------|
| Deposit | User generates proof client-side | User generates proof client-side |
| Transfer | CRE generates (fast) | User generates client-side (~2s in browser) |
| Withdraw | CRE generates | User generates client-side |
| Matching | CRE decrypts + matches + proves | **Paused** (rates encrypted, only CRE can decrypt) |
| Liquidation | CRE checks + proves | **Paused** (needs DON attestation) |
| Interest | CRE checkpoints | **Paused** (last checkpoint remains valid) |

**Funds never freeze.** Users can always transfer and withdraw. Only lending operations pause.

### 6.3 CRE Prover (WASM)

CRE already compiles workflows to WASM. Proven compatible dependencies:

| Package | Status in CRE WASM |
|---------|-------------------|
| `eciesjs v0.4` | Confirmed working |
| `viem v2` | Confirmed working |
| `@noble/hashes` | Confirmed working |
| `@noble/curves` | Confirmed working (same dep chain as eciesjs) |
| `snarkjs` (Groth16/PLONK prover) | Uses `@noble/curves` — expected compatible |

---

## 7. Shielded Addresses

Replaces the external API's `/shielded-address` endpoint with cryptographic stealth addresses.

| Step | Who | Action |
|------|-----|--------|
| **Key setup** | User (one-time) | Generate spending key `s`, viewing key `v`. Publish `S = s*G`, `V = v*G`. Share `v` with CRE. |
| **Generate stealth addr** | Sender | Ephemeral `e`, compute `shared = e*V`, stealth `addr = S + Poseidon(shared)*G`, publish ephemeral `E = e*G` |
| **Scan** | CRE (viewing key) | For each `E`: `shared = v*E`, check if `addr == S + Poseidon(shared)*G` |
| **Spend** | User (spending key) | Stealth spending key `s' = s + Poseidon(shared)`. Prove knowledge of `s'` in ZK. |

**No extra keys for users:** `spending_key = Poseidon(eth_private_key, "ghost-spending-v1")`

---

## 8. Compliance: ZK-KYC

Preserves Chainlink ACE PolicyEngine + adds ZK privacy for transfers.

| Scenario | Mechanism |
|----------|-----------|
| Deposit (public) | `ACEHook.checkDeposit()` calls `IPolicyEngine.check()` — same as current vault |
| Withdraw (public) | `ACEHook.checkWithdraw()` calls `IPolicyEngine.check()` |
| Private transfer | ZK-KYC proof: "I have valid KYC from approved attestor" without revealing identity |

**ZK-KYC flow:**
1. User completes KYC with attestor (e.g., Chainlink ACE)
2. Attestor signs `Poseidon(user_address, tier, expiry)`
3. User generates SNARK: "I have a valid attestation" (private: address, tier; public: attestor, timestamp)
4. Contract verifies proof + checks attestor is approved

---

## 9. Gas Comparison

### Per-Operation

| Operation | Current Vault | GhostVault | Tornado Cash | Aztec |
|-----------|--------------|------------|-------------|-------|
| Deposit | ~80K | ~287K | ~900K | ~500K |
| Transfer | 0 (off-chain) | ~284K | N/A | ~500K |
| Withdraw | ~120K | ~267K | ~300K | ~500K |
| Lock Collateral | N/A | ~35K | N/A | N/A |
| Liquidation | N/A | ~296K | N/A | N/A |
| Match Accept (atomic) | N/A | ~592K | N/A | N/A |
| Repay (10 ticks) | N/A | ~388K | N/A | N/A |

### On L2 (Arbitrum/Base)

| Operation | L1 Gas | L2 Cost (est.) |
|-----------|--------|----------------|
| Transfer | 284K | $0.02-0.05 |
| Match Accept | 592K | $0.05-0.10 |
| Repay | 388K | $0.03-0.07 |

### Tradeoff

| Metric | Current | Proposed |
|--------|---------|----------|
| Gas cost | Lower (no proofs) | Higher (ZK verification) |
| Privacy guarantee | Trust-based (operator) | Cryptographic (SNARK) |
| Collateral enforcement | None on-chain | Smart contract enforced |
| Fund freeze risk | API operator can freeze | Impossible (client proofs) |

---

## 10. State Distribution

| Location | What's Stored | Size |
|----------|--------------|------|
| **On-chain (GhostVault)** | Merkle root, nullifier set, leaf index | ~32B root + 32B per spent note |
| **On-chain (CollateralManager)** | Locked note set, circuit breaker | 32B per active loan |
| **On-chain (LoanLedger)** | Loan records (160B each, packed 5 slots) | 160B per loan |
| **CRE (confidential)** | CRE private key, pool spending key, decrypted rates, pool note preimages, Merkle witnesses | Ephemeral per-epoch |
| **GHOST Server** | Intents, proposals, credit scores, Merkle tree mirror, note index | In-memory (existing + mirror) |
| **ZK circuits (ephemeral)** | Note preimages, Merkle paths, blinding factors | Only during proof generation |

---

## 11. Trust Model Summary

| Entity | Trusted For | Can It Steal Funds? | Can It Censor? | Verifiable? |
|--------|------------|-------------------|---------------|-------------|
| **GhostVault (on-chain)** | State transitions, custody | No (code is law) | No | Yes (open source) |
| **CRE (DON)** | Rate decryption, matching, proof generation | No (proofs verified on-chain) | Yes (can refuse to match) | Partially (threshold encryption) |
| **GHOST Server** | Availability, metadata | No (no spending key, can't forge proofs) | Yes (can hide intents) | No trust needed for correctness |
| **Users** | Own note security, proof generation | N/A | N/A | Yes (proofs verified on-chain) |
| **Chainlink Feeds** | Price accuracy | No | No | Yes (decentralized oracle) |

---

## 12. Migration Plan

| Phase | Timeline | Deliverable |
|-------|----------|-------------|
| **Phase 1: Parallel** | Weeks 1-6 | GhostVault deployed alongside current vault. Both work. Feature flag: `VAULT_BACKEND=cpt\|ghost\|both`. v1 routes unchanged, v2 routes added. |
| **Phase 2: Parity** | Weeks 7-10 | Collateral locking, liquidation proofs, client-side SNARK prover (snarkjs WASM in browser), stealth addresses, note backup UX. |
| **Phase 3: Standalone** | Weeks 11-14 | Atomic migration contract (CPT withdraw + GhostVault deposit in one tx). Remove `external-api.ts`, remove v1 routes, remove feature flags. |

### Migration Contract (Atomic)

```
1. CPT.withdrawWithTicket(token, amount, ticket)   // pull from old vault
2. GhostVault.deposit(token, amount, comm, proof)   // push to new vault
// Single transaction — no intermediate state
```

---

## 13. New CRE Capability Proposal

This design motivates a new CRE SDK capability:

```typescript
// Proposed addition to @chainlink/cre-sdk
const prover = cre.capabilities.ZKProver();

const proof = await prover.prove(runtime, {
    circuit: 'transfer',
    publicInputs:  { nullifier, newCommitment, root },
    privateInputs: { balance, salt, spendingKey, merklePath }
});

// Submit to on-chain verifier
await runtime.capabilities.EVMClient()
    .submitTransaction(ghostVaultAddr, 'transfer', [..., proof]);
```

Any CRE workflow could then generate ZK proofs — not just GHOST. This turns CRE into a general-purpose privacy engine.

---

## 14. Why This Matters for Chainlink

| Value Proposition | Detail |
|------------------|--------|
| **CRE becomes more valuable** | Evolves from "confidential API proxy" to "confidential proof engine." Strictly more powerful. |
| **New `ZKProverCapability`** | Reusable across any CRE workflow. Enables private DEXs, private payroll, private voting — all on CRE. |
| **Reduces operational burden** | Chainlink no longer operates the CPT vault API as a centralized service. Custody moves to smart contracts. |
| **ACE/PolicyEngine preserved** | Every deposit checks compliance. ZK-KYC extends compliance to private transfers. |
| **Generalizable pattern (ASCV)** | GhostVault is a template. Chainlink can productize "Application-Specific Confidential Vaults" for any use case. |
| **Competitive moat** | No other platform combines: ZK proofs inside confidential compute + DON attestations + compliance hooks + working lending reference. |

---

## 15. Implementation Dependencies

| Dependency | Purpose | WASM Compatible |
|-----------|---------|-----------------|
| `circom 2.1+` | Circuit compiler | N/A (build tool) |
| `snarkjs 0.7+` | Groth16/PLONK prover | Yes (WASM target) |
| `@noble/curves` | BN254 operations | Yes (already in tree via eciesjs) |
| `circomlib` (iden3) | Poseidon, MerkleProof, comparators | Yes |
| `eciesjs v0.4` | Encrypted notes for CRE | Yes (confirmed in CRE) |

---

## 16. Emergency Mechanisms

| Mechanism | Contract | Detail |
|-----------|----------|--------|
| **Granular pause** | GhostVault | Pause deposits, transfers, withdrawals, or lending independently |
| **Circuit breaker** | CollateralManager | Max 10 liquidations/hour; prevents flash-loan mass liquidation |
| **Timelock** | All proxies | 48h delay on upgrades, 3/5 multisig |
| **Instant pause** | All | Emergency pause without timelock (multisig only) |
| **Interest staleness** | LoanLedger | If no checkpoint in 24h, freeze accrual at last value |
| **Client fallback** | GhostVault | Users generate transfer/withdraw proofs in browser if CRE is down |

---

## 17. Summary Differentiation Table

| Feature | Chainlink CPT Vault | GhostVault (ASCV) | Tornado Cash | Aztec Connect | Aave |
|---------|--------------------|--------------------|-------------|---------------|------|
| Balance privacy | Off-chain (trust) | On-chain ZK (verify) | On-chain ZK | On-chain ZK | None |
| Lending support | None | Native (collateral, liquidation, interest) | None | Generic DeFi | Native but public |
| Collateral locking | None | Smart contract enforced | N/A | N/A | Public on-chain |
| Rate privacy | N/A | Sealed bids (ECIES + ZK ordering proof) | N/A | N/A | None |
| Compliance | ACE PolicyEngine | ACE + ZK-KYC | None | Optional | None |
| CRE integration | External API calls | ZK proof generation + DON attestations | None | None | None |
| Fund freeze risk | API operator can freeze | Impossible (client proofs) | Contract-level | Contract-level | Governance-level |
| Upgrade path | None | UUPS + timelock | None | Proxy | Governance |
| Gas per transfer | 0 (off-chain) | ~284K | ~300K | ~500K | ~150K (public) |
| Privacy model | Custodial | Cryptographic | Cryptographic | Cryptographic | None |
| Interest verification | N/A | SNARK-verified | N/A | N/A | Public on-chain |
| Liquidation verification | N/A | SNARK-verified | N/A | N/A | Public on-chain |

---

*GHOST Protocol | Private P2P Lending with Tick-Based Rate Discovery*
*Built on Chainlink CRE | Proposed March 2026*
