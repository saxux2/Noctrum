# GHOST Custom Vault Architecture

## Proposal: Application-Specific Confidential Vault (ASCV) for Private P2P Lending

> A privacy-preserving, lending-native vault that replaces Chainlink's generic
> `DemoCompliantPrivateTokenVault` with ZK-enforced balances, on-chain collateral
> management, and CRE-generated proofs — while preserving full ACE/PolicyEngine
> compliance integration.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Chainlink Vault Analysis](#2-current-chainlink-vault-analysis)
3. [Why a Custom Vault](#3-why-a-custom-vault)
4. [System Architecture](#4-system-architecture)
5. [Smart Contract Design](#5-smart-contract-design)
6. [Zero-Knowledge Proof Layer](#6-zero-knowledge-proof-layer)
7. [Shielded Address Scheme](#7-shielded-address-scheme)
8. [CRE + ZK Integration](#8-cre--zk-integration)
9. [Data Flows](#9-data-flows)
10. [State Management](#10-state-management)
11. [Trust Model](#11-trust-model)
12. [Compliance (ZK-KYC)](#12-compliance-zk-kyc)
13. [Gas Analysis](#13-gas-analysis)
14. [Scaling Strategy](#14-scaling-strategy)
15. [Migration Plan](#15-migration-plan)
16. [Why Chainlink Should Care](#16-why-chainlink-should-care)

---

## 1. Executive Summary

GHOST Protocol currently delegates ALL fund custody to Chainlink's
`DemoCompliantPrivateTokenVault` (`0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13`).
That vault is a general-purpose deposit/withdraw container with off-chain
private transfer support. It knows nothing about lending.

We propose a **GHOST-native vault** that:

- Replaces off-chain balance tracking with **on-chain Pedersen commitments**
  verified by ZK proofs (SNARK-enforced privacy, not trust-based)
- Adds **lending primitives on-chain**: collateral locking, liquidation hooks,
  interest checkpoints, loan lifecycle management
- Makes **CRE the proof generator** (not just an API caller), using its
  confidential compute to produce ZK proofs that are verified on-chain
- Preserves **Chainlink ACE/PolicyEngine** compliance at every entry/exit point
- Provides a **fallback**: if CRE goes down, users can still generate transfer
  and withdrawal proofs client-side — funds never freeze

This is not a fork or competitor to Chainlink. It is an **extension** that makes
CRE more valuable and demonstrates a reusable pattern: the Application-Specific
Confidential Vault (ASCV).

---

## 2. Current Chainlink Vault Analysis

### Contract: `DemoCompliantPrivateTokenVault.sol`

```
Compiler:  Solidity 0.8.30 (prague EVM)
License:   BUSL-1.1
Inherits:  EIP712 (OpenZeppelin)
Imports:   IERC20, IERC20Permit, SafeERC20, ECDSA, IPolicyEngine
Address:   0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13 (Sepolia)
```

### State Variables

```solidity
mapping(address token => address policyEngine) public sPolicyEngines;
mapping(address token => address registrar)    public sRegistrars;
address public immutable I_WITHDRAW_TICKET_SIGNER;
mapping(bytes32 digest => bool used)           private sUsedWithdrawTickets;
```

### Core Functions

| Function | What It Does |
|----------|-------------|
| `register(token, policyEngine)` | Token registrar links token to its ACE PolicyEngine. Only original registrar can update. |
| `deposit(token, amount)` | `safeTransferFrom` ERC20 into vault, emit `Deposit`, run PolicyEngine check. |
| `depositWithPermit(...)` | Same but uses ERC-2612 permit (gasless approval). |
| `withdrawWithTicket(token, amount, ticket)` | Decode 89-byte ticket (nonce + deadline + ECDSA sig), verify against `I_WITHDRAW_TICKET_SIGNER`, check not expired/used, `safeTransfer` out. |
| `checkDepositAllowed(...)` | View: dry-run PolicyEngine check for deposit. |
| `checkWithdrawAllowed(...)` | View: dry-run PolicyEngine check for withdrawal. |
| `checkPrivateTransferAllowed(...)` | View: dry-run PolicyEngine check for private transfer. |

### What's Missing for Lending

| Gap | Impact on GHOST |
|-----|----------------|
| No collateral locking | Borrower can withdraw collateral anytime — trust-based only |
| No loan state | Server tracks loans in-memory Maps — zero on-chain enforceability |
| No liquidation hooks | CRE liquidates by posting to server HTTP endpoint, not on-chain |
| No interest accrual | Entirely computed off-chain, no verifiability |
| Balance privacy is trust-based | Off-chain API tracks balances — operator could fabricate or leak |
| Single withdrawal signer | `I_WITHDRAW_TICKET_SIGNER` is immutable — no key rotation, no multisig |
| No upgrade path | Not behind a proxy — cannot add features |

### The Core Issue

The vault is a **dumb ERC20 escrow** with compliance hooks. All privacy is
provided by the off-chain API, which is a trusted black box. GHOST layers
its lending logic entirely off-chain (server + CRE), with no on-chain
enforceability for the most critical operations: collateral custody,
liquidation, and interest calculation.

---

## 3. Why a Custom Vault

```
CURRENT: Trust Chain
  User --> trusts --> External API (balance tracking)
       --> trusts --> CRE (matching, rate decryption)
       --> trusts --> GHOST Server (intent management)
       --> trusts --> Pool Wallet (fund movement)

PROPOSED: Verify Chain
  User --> verifies on-chain --> ZK proofs (balance correctness)
       --> verifies on-chain --> Collateral locks (cannot be withdrawn)
       --> verifies on-chain --> Liquidation proofs (math checks out)
       --> trusts CRE for --> Rate decryption + matching (but proofs verify results)
       --> trusts Server for --> Availability only (cannot forge proofs or steal funds)
```

**What changes**: Balance correctness moves from "trust the API operator" to
"verify the SNARK proof on-chain." Collateral custody moves from "trust the
server not to release it" to "smart contract enforces the lock."

**What stays the same**: CRE still decrypts rates and runs matching. But now
CRE also generates ZK proofs that anyone can verify.

---

## 4. System Architecture

```
+===========================================================================+
|                          CLIENT (Next.js + Privy)                          |
|                                                                            |
|  - ECIES rate encryption (existing)                                        |
|  - SNARK proof generation for deposits/withdrawals (snarkjs WASM)          |
|  - EIP-712 signing (existing)                                              |
|  - Stealth address derivation (new)                                        |
+============================+===============================================+
                             |
              EIP-712 sigs + ZK proofs + encrypted rates
                             |
         +-------------------+--------------------+
         |                                        |
         v                                        v
+--------+---------+               +--------------+------------------+
| GHOST API SERVER |               |  ON-CHAIN CONTRACTS             |
| (Hono + Bun)     |               |  (Sepolia / L2)                 |
|                  |               |                                  |
| "Dumb storage"   |               |  GhostVault.sol                 |
| + Merkle mirror  |               |    Pedersen commitment tree      |
|                  |               |    Nullifier set                 |
| state.ts:        |               |    SNARK verifiers               |
|  depositSlots    |               |                                  |
|  activeBuffer    |               |  CollateralManager.sol           |
|  borrowIntents   |               |    Lock/release/liquidate        |
|  matchProposals  |               |    CRE attestation verification  |
|  loans           |               |    Circuit breaker               |
|  pendingTransfers|               |                                  |
|  creditScores    |               |  LoanLedger.sol                 |
|  noteIndex (NEW) |               |    On-chain loan records          |
|  commitmentTree  |               |    Interest checkpoints          |
|    (mirror, NEW) |               |    Privacy-preserving (hashed)   |
|                  |               |                                  |
| Relayer (NEW):   |               |  ACEHook.sol                    |
|  Event listener  |               |    PolicyEngine integration      |
|  Batch submitter |               |    Compliance on deposit/withdraw|
|  Proof forwarder |               |                                  |
+--------+---------+               |  GhostRouter.sol                |
         |                         |    CRE entry point               |
  ConfidentialHTTPClient           |    Atomic multi-contract ops     |
         |                         +--------+--------+----------------+
         v                                  |        |
+--------+----------------------------------+--------+---------+
|  CRE WORKFLOWS (Chainlink DON — Confidential Compute)        |
|                                                               |
|  settle-loans (every 30s)                                     |
|    - Decrypt rates (eciesjs, existing)                        |
|    - Run matching engine (existing)                           |
|    - Generate rate-ordering ZK proof (NEW)                    |
|    - Generate collateral-adequacy ZK proof (NEW)              |
|    - Submit proofs + proposals to GhostRouter.sol             |
|                                                               |
|  execute-transfers (every 15s)                                |
|    - Build transfer ZK proofs (nullifier + new commitments)   |
|    - Submit proofs to GhostVault.sol                          |
|    - Replaces: signing EIP-712 and calling external API       |
|                                                               |
|  check-loans (every 60s)                                      |
|    - Read ETH/USD from Chainlink price feed (existing)        |
|    - Compute health ratios                                    |
|    - Generate liquidation ZK proofs (NEW)                     |
|    - Submit to CollateralManager.liquidate()                  |
|                                                               |
|  interest-stream (every 1h, NEW)                              |
|    - Compute accrued interest per tick (discriminatory rates)  |
|    - Generate interest-calculation ZK proof                   |
|    - Post signed checkpoint to LoanLedger.sol                 |
|                                                               |
|  Secrets (Vault DON):                                         |
|    CRE_PRIVATE_KEY (eciesjs)                                  |
|    POOL_PRIVATE_KEY (Ethereum)                                |
|    RELAYER_SIGNING_KEY (new)                                  |
+---------------------------------------------------------------+
```

---

## 5. Smart Contract Design

### 5.1 GhostVault.sol — Core Privacy Vault

Replaces `DemoCompliantPrivateTokenVault`. Uses a Pedersen commitment Merkle
tree instead of trust-based off-chain balances.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPolicyEngine} from "@chainlink/policy-management/interfaces/IPolicyEngine.sol";

interface IGhostVault {

    // ──────────────────── Events ────────────────────
    event NoteCreated(
        uint256 indexed leafIndex,
        bytes32 commitment,
        bytes   encryptedNote    // eciesjs(CRE_pubkey, {owner, token, amount, salt})
    );
    event NoteNullified(bytes32 indexed nullifier);
    event RootUpdated(bytes32 newRoot);

    // ──────────────────── Deposit ────────────────────
    // User deposits ERC20, creates a Pedersen commitment on-chain.
    // The amount is public at deposit time (ERC20 transfer is visible),
    // but becomes private after the first transfer/split.
    //
    // commitment = Pedersen(owner, token, amount, salt) on BN254
    // proof      = Groth16 proof that commitment is well-formed
    //
    function deposit(
        address token,
        uint256 amount,
        bytes32 commitment,
        bytes   calldata encryptedNote,  // for CRE to index
        bytes   calldata proof           // SNARK: commitment is well-formed
    ) external;

    // ──────────────────── Transfer (Private) ────────────────────
    // Spend old notes (via nullifiers), create new notes.
    // On-chain: only nullifiers and new commitments are visible.
    // No addresses, amounts, or token types revealed.
    //
    function transfer(
        bytes32[]  calldata nullifiers,       // old notes being spent
        bytes32[]  calldata newCommitments,    // new notes created
        bytes[]    calldata encryptedNotes,    // for CRE indexing
        bytes32    merkleRoot,                 // root at time of proof generation
        bytes      calldata proof              // SNARK: valid spend + balance conservation
    ) external;

    // ──────────────────── Withdraw ────────────────────
    // Burn a note, release ERC20 to recipient.
    // Amount and recipient are public (ERC20 transfer is visible).
    //
    function withdraw(
        bytes32 nullifier,
        address recipient,
        address token,
        uint256 amount,
        bytes32 merkleRoot,
        bytes   calldata proof     // SNARK: note exists, owned by caller, has this amount
    ) external;

    // ──────────────────── Views ────────────────────
    function merkleRoot() external view returns (bytes32);
    function isNullified(bytes32 nullifier) external view returns (bool);
    function nextLeafIndex() external view returns (uint256);
    function TREE_DEPTH() external pure returns (uint8);   // 20 => ~1M notes
}
```

**Key differences from `DemoCompliantPrivateTokenVault`:**

| Dimension | Current Vault | GhostVault |
|-----------|--------------|------------|
| Balance tracking | Off-chain API (trusted) | On-chain Pedersen commitments (ZK-verified) |
| Transfer privacy | Off-chain API hides amounts | On-chain: only nullifiers + commitments visible |
| Withdrawal auth | Single immutable signer (`I_WITHDRAW_TICKET_SIGNER`) | ZK proof of note ownership |
| Upgradeability | None (no proxy) | UUPS proxy with 48h timelock |
| Compliance | PolicyEngine on deposit/withdraw | Same + ZK-KYC attestations |

### 5.2 CollateralManager.sol — Lending-Native Collateral

Does not exist in the current system. All collateral tracking is in-memory on
the GHOST server (`state.ts`). This contract makes collateral locks enforceable.

```solidity
interface ICollateralManager {

    // ──────────────────── Events ────────────────────
    event CollateralLocked(
        bytes32 indexed loanHash,
        bytes32 indexed noteCommitment,
        uint256 timestamp
    );
    event CollateralReleased(bytes32 indexed loanHash, bytes32 indexed noteCommitment);
    event CollateralSeized(bytes32 indexed loanHash, uint256 seizedCount);

    // ──────────────────── Lock ────────────────────
    // CRE calls this when a match is accepted.
    // The note commitment is marked as "locked" — cannot be nullified
    // (transferred/withdrawn) until released.
    //
    // attestation = CRE DON threshold signature on {loanHash, noteCommitment, timestamp}
    //
    function lockCollateral(
        bytes32 loanHash,
        bytes32 noteCommitment,
        bytes   calldata attestation   // DON threshold sig
    ) external;

    // ──────────────────── Release ────────────────────
    // CRE calls this on full repayment or cancellation.
    //
    function releaseCollateral(
        bytes32 loanHash,
        bytes   calldata attestation
    ) external;

    // ──────────────────── Liquidate ────────────────────
    // CRE calls this when health ratio drops below threshold.
    // Unlocks the note so CRE can nullify it and redistribute.
    //
    // proof = ZK proof that health ratio < threshold given current price
    //
    function liquidate(
        bytes32   loanHash,
        bytes32   priceAttestation,     // Chainlink DON-signed ETH/USD
        bytes     calldata proof,       // SNARK: collateral_value < principal * threshold
        bytes     calldata attestation  // CRE DON sig
    ) external;

    // ──────────────────── Views ────────────────────
    function isLocked(bytes32 noteCommitment) external view returns (bool);
    function loanCollateral(bytes32 loanHash) external view returns (bytes32 noteCommitment);

    // ──────────────────── Safety ────────────────────
    // Circuit breaker: max N liquidations per hour
    function setCircuitBreaker(uint16 maxPerHour) external;   // onlyOwner
}
```

### 5.3 LoanLedger.sol — Privacy-Preserving On-Chain Loans

Stores loan records on-chain with privacy: borrower identity is hashed,
individual lender rates are NOT stored (only aggregate), amounts are hidden
behind commitments.

```solidity
interface ILoanLedger {

    struct LoanRecord {
        bytes32 borrowerHash;         // keccak256(borrower) — not raw address
        bytes32 principalCommitment;  // Pedersen commitment to principal
        bytes32 collateralCommitment; // Pedersen commitment to collateral
        uint32  aggregateRateBps;     // blended rate in bps (public, non-discriminatory)
        uint32  maturity;             // unix timestamp
        uint8   status;               // 0=active, 1=repaid, 2=defaulted
        uint8   tickCount;            // number of matched lenders
    }
    // Packed into 5 storage slots (160 bytes)

    event LoanCreated(bytes32 indexed loanHash, uint32 maturity);
    event LoanRepaid(bytes32 indexed loanHash, uint256 timestamp);
    event LoanDefaulted(bytes32 indexed loanHash, uint256 timestamp);
    event InterestCheckpoint(bytes32 indexed loanHash, uint256 accrued, uint256 timestamp);

    function createLoan(
        bytes32           loanHash,
        LoanRecord        calldata record,
        bytes             calldata attestation  // CRE DON sig
    ) external;

    function createLoanBatch(
        bytes32[]         calldata loanHashes,
        LoanRecord[]      calldata records,
        bytes             calldata attestation
    ) external;

    function markRepaid(bytes32 loanHash, bytes calldata attestation) external;
    function markDefaulted(bytes32 loanHash, bytes calldata attestation) external;

    function postInterestCheckpoint(
        bytes32 loanHash,
        uint256 totalAccrued,         // aggregate interest owed
        bytes   calldata attestation  // CRE DON sig
    ) external;

    function getLoan(bytes32 loanHash) external view returns (LoanRecord memory);
}
```

**Privacy note**: The on-chain record reveals that a loan exists with a certain
maturity and aggregate rate. It does NOT reveal: who the borrower is (only hash),
the actual principal or collateral (only commitments), or individual lender rates
(only aggregate). Per-tick discriminatory rates remain known only to CRE.

### 5.4 GhostRouter.sol — CRE Orchestrator

Single entry point for CRE to coordinate multi-contract actions atomically.

```solidity
interface IGhostRouter {

    // Called by CRE when a match proposal is accepted (or auto-accepted).
    // Atomically: locks collateral + creates loan + disburses principal.
    function onMatchAccepted(
        // Collateral lock
        bytes32 loanHash,
        bytes32 collateralNoteCommitment,
        // Loan creation
        ILoanLedger.LoanRecord calldata loanRecord,
        // Principal disbursement (private transfer from pool to borrower)
        bytes32[] calldata nullifiers,
        bytes32[] calldata newCommitments,
        bytes[]   calldata encryptedNotes,
        bytes32   merkleRoot,
        bytes     calldata transferProof,
        // Authorization
        bytes     calldata attestation      // CRE DON sig over entire payload
    ) external;

    // Called by CRE on repayment.
    // Atomically: marks repaid + releases collateral + distributes to lenders.
    function onRepayment(
        bytes32   loanHash,
        // Collateral release
        bytes32   collateralNoteCommitment,
        // Lender payouts (private transfers from pool to each lender)
        bytes32[] calldata nullifiers,
        bytes32[] calldata newCommitments,
        bytes[]   calldata encryptedNotes,
        bytes32   merkleRoot,
        bytes     calldata transferProof,
        // Interest verification
        bytes     calldata interestProof,   // SNARK: repayment covers principal + interest
        // Authorization
        bytes     calldata attestation
    ) external;

    // Called by CRE on liquidation.
    // Atomically: seizes collateral + marks defaulted + distributes to lenders.
    function onLiquidation(
        bytes32   loanHash,
        bytes32   priceAttestation,
        bytes     calldata liquidationProof,
        // Collateral redistribution
        bytes32[] calldata nullifiers,
        bytes32[] calldata newCommitments,
        bytes[]   calldata encryptedNotes,
        bytes32   merkleRoot,
        bytes     calldata transferProof,
        // Authorization
        bytes     calldata attestation
    ) external;
}
```

### 5.5 InterestAccrual.sol — Pure Math Library

```solidity
library InterestAccrual {

    uint256 constant SECONDS_PER_YEAR = 365.25 days;
    uint256 constant WAD = 1e18;

    /// Simple interest: principal * rate * (elapsed / year)
    /// All values in WAD (18 decimals)
    function accruedInterest(
        uint256 principal,
        uint256 rateBps,       // e.g. 500 = 5%
        uint256 elapsedSeconds
    ) internal pure returns (uint256) {
        return (principal * rateBps * elapsedSeconds) / (10000 * SECONDS_PER_YEAR);
    }

    /// Total owed = principal + accrued interest
    function totalOwed(
        uint256 principal,
        uint256 rateBps,
        uint256 elapsedSeconds
    ) internal pure returns (uint256) {
        return principal + accruedInterest(principal, rateBps, elapsedSeconds);
    }

    /// Health ratio = (collateral * price) / principal
    /// Returns in WAD (1e18 = 1.0x)
    function healthRatio(
        uint256 collateralAmount,
        uint256 collateralPriceWad,  // price in WAD (e.g. 2000e18 for $2000)
        uint256 principalAmount
    ) internal pure returns (uint256) {
        if (principalAmount == 0) return type(uint256).max;
        return (collateralAmount * collateralPriceWad) / principalAmount;
    }
}
```

### 5.6 ACEHook.sol — Compliance Wrapper

Wraps Chainlink ACE PolicyEngine checks. Every deposit and withdrawal must pass.

```solidity
interface IACEHook {
    /// Called by GhostVault before accepting a deposit commitment.
    /// Verifies depositor passes PolicyEngine rules (KYC/AML).
    function checkDeposit(address depositor, address token, uint256 amount) external view;

    /// Called by GhostVault before executing a withdrawal.
    function checkWithdraw(address withdrawer, address token, uint256 amount) external view;

    /// For ZK-KYC: verify a proof that the user has valid KYC
    /// without revealing their identity on-chain.
    function checkZKKYC(bytes calldata proof, bytes32 attestorRoot) external view;
}
```

### 5.7 Contract Deployment & Upgrade

```
GhostVault         --> UUPS Proxy, 48h timelock, 3/5 multisig
CollateralManager  --> UUPS Proxy, same timelock
LoanLedger         --> UUPS Proxy, same timelock
GhostRouter        --> Immutable (thin orchestrator, no state)
ACEHook            --> Immutable (delegates to PolicyEngine)
Groth16Verifiers   --> Immutable (one per circuit, redeployed on circuit change)
InterestAccrual    --> Library (linked at deploy, no proxy needed)
```

---

## 6. Zero-Knowledge Proof Layer

### 6.1 Why ZK for GHOST

| Current (Trust-Based) | Proposed (ZK-Verified) |
|----------------------|----------------------|
| Off-chain API says "Alice has 500 gUSD" | On-chain commitment `C = 500*G + r*H` with ZK proof of well-formedness |
| Server says "collateral is sufficient" | SNARK proves `collateral * price >= principal * multiplier` |
| CRE says "matching was fair" | SNARK proves lends sorted cheapest-first, blended rate <= maxRate |
| CRE says "loan is undercollateralized" | SNARK proves health ratio < threshold given oracle price |
| Server says "repayment covers interest" | SNARK proves `repayment >= sum(tick_i * (1 + rate_i))` |

### 6.2 Commitment Scheme: Pedersen on BN254

```
Balance Commitment:
  C(v, r) = v * G + r * H

  G, H = generators of BN254 G1 group
  H    = HashToCurve(G) — nobody knows log_G(H)
  v    = balance value (uint256)
  r    = random blinding factor (uint256)
```

**Why Pedersen on BN254:**
- Ethereum has native precompiles for BN254: `ecAdd` (0x06, 150 gas),
  `ecMul` (0x07, 6000 gas), `ecPairing` (0x08, for Groth16 verification)
- Additively homomorphic: `C(a) + C(b) = C(a+b)` — enables balance updates
  without revealing amounts
- SNARK-friendly: Pedersen commitments use the same curve as Groth16 proofs

**Note structure (stored encrypted for CRE):**
```
Note {
    owner:   address    // stealth address (not raw Ethereum address)
    token:   address    // gUSD or gETH contract
    amount:  uint256    // balance value
    salt:    bytes32    // random blinding / nonce
}

commitment = Poseidon(owner, token, amount, salt)
```

**Nullifier (double-spend prevention):**
```
nullifier = Poseidon(spending_key, commitment_index, nonce)
```

Poseidon hash: ~240 R1CS constraints per permutation vs ~25,000 for SHA-256.
8x cheaper in-circuit. The on-chain contract stores `mapping(bytes32 => bool)`.

### 6.3 The Five ZK Circuits

#### Circuit 1: Transfer Proof

Prove a private transfer is valid without revealing sender, recipient, or amount.

```
PUBLIC INPUTS (8 field elements):
  C_sender_old       — old sender commitment (2 coords)
  C_sender_new       — new sender commitment (2 coords)
  C_recipient_new    — new recipient commitment (2 coords)
  nullifier_sender   — proves old note is being spent
  merkle_root        — state root at proof time

PRIVATE INPUTS (witness):
  v_sender_old, r_sender_old    — old balance + blinding
  v_transfer, r_transfer        — transfer amount + blinding
  v_sender_new, r_sender_new    — new balance + blinding
  spending_key_sender
  merkle_path[20]               — Merkle inclusion proof

CONSTRAINTS:
  1. C_sender_old opens correctly (commitment verification)
  2. v_sender_new = v_sender_old - v_transfer (balance arithmetic)
  3. v_sender_new >= 0 (64-bit range proof)
  4. v_transfer > 0 (non-zero transfer)
  5. C_sender_new is well-formed
  6. nullifier = Poseidon(spending_key, index, nonce)
  7. MerkleVerify(root, C_sender_old, path)

ESTIMATED CONSTRAINTS: ~28,000 (Groth16)
PROOF SIZE:            128 bytes (2 G1 + 1 G2 point)
VERIFY GAS:            ~220,000
PROVING TIME:          ~2s client-side (snarkjs WASM)
```

#### Circuit 2: Collateral Adequacy Proof

Prove collateral covers the required amount without revealing either value or
the borrower's credit tier.

```
PUBLIC INPUTS:
  C_collateral            — commitment to collateral amount
  C_principal             — commitment to loan principal
  price_attestation       — Chainlink DON-signed ETH/USD price
  tier_commitment         — commitment to credit tier multiplier
  nullifier_collateral    — prevents double-pledging

PRIVATE INPUTS:
  v_collateral, r_collateral
  v_principal, r_principal
  price                          — ETH/USD (matches attestation)
  multiplier                     — 1.2 | 1.5 | 1.8 | 2.0 (based on tier)

CONSTRAINTS:
  1. Commitment openings
  2. price matches oracle attestation
  3. multiplier in {12000, 15000, 18000, 20000} (scaled by 10000)
  4. v_collateral * price >= v_principal * multiplier
  5. Range proofs on all values (64-bit)

ESTIMATED CONSTRAINTS: ~15,000 (price as public input, no ECDSA in-circuit)
PROOF SIZE:            128 bytes
VERIFY GAS:            ~220,000
PROVING TIME:          ~1s (CRE-side)
```

#### Circuit 3: Interest Calculation Proof

Prove repayment covers principal + interest across all matched ticks at their
discriminatory rates, without revealing individual rates.

```
PUBLIC INPUTS:
  C_total_owed        — commitment to total owed
  C_repayment         — commitment to repayment amount
  loan_id_hash
  n_ticks             — number of matched lenders

PRIVATE INPUTS:
  For each tick i:
    amount_i, rate_i, blinding_i
  total_owed, r_total_owed
  repayment, r_repayment

CONSTRAINTS:
  1. For each tick: owed_i = amount_i * (1 + rate_i)  (fixed-point, 18 decimals)
  2. total_owed = sum(owed_i)
  3. C_total_owed opens correctly
  4. repayment >= total_owed (range proof on difference)
  5. 0 < rate_i < 1 for each tick

ESTIMATED CONSTRAINTS: ~5,000 + 1,500 per tick
  10 ticks: ~20,000
PROOF SYSTEM: PLONK (variable tick count, universal setup)
PROOF SIZE:   ~500 bytes
VERIFY GAS:   ~300,000
PROVING TIME: ~3s (CRE-side)
```

#### Circuit 4: Liquidation Proof

Prove a loan is undercollateralized, justifying seizure.

```
PUBLIC INPUTS:
  C_collateral, C_principal
  price_attestation         — Chainlink DON-signed price
  threshold                 — liquidation threshold (e.g. 1.5, public)
  loan_id_hash

PRIVATE INPUTS:
  v_collateral, r_collateral
  v_principal, r_principal
  price

CONSTRAINTS:
  1. Commitment openings
  2. v_collateral * price < v_principal * threshold (STRICT inequality)
  3. Range proofs
  4. Price matches attestation

ESTIMATED CONSTRAINTS: ~15,000
PROOF SIZE:            128 bytes
VERIFY GAS:            ~220,000
PROVING TIME:          ~1s (CRE-side)
```

#### Circuit 5: Rate Ordering Proof (Novel)

Prove CRE's matching is correct: lends sorted cheapest-first, blended rate
does not exceed borrower's max rate. **No existing ZK protocol has this.**

```
PUBLIC INPUTS:
  C_blended_rate            — commitment to blended rate
  C_max_rate                — commitment to borrower's max rate
  n_matched_ticks
  C_total_principal
  match_hash                — hash of all intent IDs

PRIVATE INPUTS:
  For each tick: rate_i, amount_i
  max_rate (decrypted from borrower's encrypted max rate)
  Blinding factors

CONSTRAINTS:
  1. blended_rate = sum(rate_i * amount_i) / sum(amount_i)
  2. blended_rate <= max_rate
  3. For i < j: rate_i <= rate_j (sorted cheapest-first — proves greedy optimality)
  4. All rates in (0, 1)
  5. All amounts > 0
  6. Commitment openings

ESTIMATED CONSTRAINTS: ~8,000 + 800 per tick
  10 ticks: ~16,000
PROOF SYSTEM: PLONK (variable ticks, lookup tables for rate validation)
PROOF SIZE:   ~500 bytes
VERIFY GAS:   ~300,000
PROVING TIME: ~2s (CRE-side)
```

### 6.4 Proof System Selection

| Circuit | System | Why |
|---------|--------|-----|
| Transfer | Groth16 (BN254) | Smallest proof (128B), cheapest verify (~220K gas), fixed circuit |
| Collateral Adequacy | Groth16 | Same — fixed structure |
| Interest Calculation | PLONK | Variable tick count, universal setup, PLookup for rate validation |
| Liquidation | Groth16 | Fixed, cheap |
| Rate Ordering | PLONK | Variable ticks, universal setup |

**Why not STARKs:** Proof sizes 40-200KB = 300K-1.5M gas just for calldata.
Prohibitive for frequent operations. STARKs only make sense for batched rollup
verification.

### 6.5 Merkle Tree

```
Hash function:    Poseidon (SNARK-friendly, ~1,500 gas on-chain with optimized assembly)
Depth:            20 (2^20 = 1,048,576 leaf slots)
Type:             Append-only (no deletions — nullifiers handle "spending")
On-chain storage: Only root (32 bytes) + next leaf index
Off-chain mirror: Full tree in GHOST server + CRE (for witness generation)
Leaf insertion:   ~30K gas (20 Poseidon hashes)
```

---

## 7. Shielded Address Scheme

### Stealth Addresses via ECDH

Replaces the current external API `GET /shielded-address` endpoint with a
cryptographic scheme.

**Key setup (per user, one-time):**
```
Spending keypair:  s (private), S = s * G (public, published)
Viewing keypair:   v (private, shared with CRE), V = v * G (public, published)
```

**Generating a stealth address (sender side):**
```
1. Generate ephemeral keypair:  e (random), E = e * G
2. Shared secret:               shared = e * V = e * v * G
3. Stealth address:             addr = S + Poseidon(shared) * G
4. Publish E on-chain (ephemeral public key, in encryptedNote)
```

**Scanning (CRE side, using viewing key v):**
```
1. For each E on-chain:  shared = v * E = v * e * G
2. Check:                addr == S + Poseidon(shared) * G  for known S values
3. If match: CRE knows the recipient (can index the note)
```

**Spending (user side, using spending key s):**
```
1. Stealth spending key:  s' = s + Poseidon(shared)
2. User proves knowledge of s' in ZK (transfer circuit, constraint 6)
```

**Key derivation from Ethereum wallet (no extra keys for user):**
```
spending_key = Poseidon(eth_private_key, "ghost-spending-v1")
viewing_key  = Poseidon(eth_private_key, "ghost-viewing-v1")
```

**Privacy guarantees:**
- Sender cannot link stealth address to recipient's real address
- Recipient's on-chain identity is a one-time stealth address
- CRE (with viewing key) can scan all notes — necessary for matching/liquidation
- Only user with spending key can actually spend the note

---

## 8. CRE + ZK Integration

### The "Trusted-but-Verified Prover" Model

This is the architectural innovation. CRE currently acts as a fully trusted
party. With ZK, CRE becomes a **prover** whose outputs are verifiable:

```
                    CURRENT MODEL                  PROPOSED MODEL
                    ─────────────                  ──────────────

CRE says            "Alice's rate is 5%,           Same, but also produces
"match is valid"     match is fair"                 a rate-ordering ZK proof.
                     |                              |
Server trusts it     Server records it              On-chain verifier checks
blindly              |                              the SNARK proof.
                     No verification possible       Anyone can verify.

CRE says            "Bob's loan is                  Same, but produces a
"liquidate"          undercollateralized"            liquidation ZK proof.
                     |                              |
Server executes      Server queues transfer          CollateralManager.sol
blindly              |                              verifies proof before
                     No on-chain enforcement        seizing collateral.
```

**What CRE gains:** Its role expands from "API caller" to "proof generator."
This is strictly more valuable for Chainlink — CRE becomes the essential
infrastructure for privacy-preserving DeFi, not just an HTTP proxy.

### CRE Prover Implementation

CRE workflows already compile to WASM. The ZK prover can be packaged as a WASM
module, exactly like `eciesjs` is imported today:

```typescript
// ghost-settler/settle-loans/main.ts (proposed addition)
import { groth16 } from 'snarkjs';  // WASM-compatible

// After matching engine runs:
const proof = await groth16.fullProve(
    {
        // Private inputs
        rates: matchedTicks.map(t => t.rate),
        amounts: matchedTicks.map(t => t.amount),
        maxRate: decryptedMaxRate,
        // ... blinding factors
    },
    'rate_ordering.wasm',    // compiled circuit
    'rate_ordering.zkey'     // proving key
);

// Submit proof + result to GhostRouter.sol
await runtime.capabilities.EVMClient().submitTransaction(
    ghostRouterAddress,
    'onMatchAccepted',
    [loanHash, collateralNote, loanRecord, proof, attestation]
);
```

**WASM compatibility confirmed:**
- `eciesjs v0.4` — works in CRE WASM (per CLAUDE.md)
- `viem v2` — works in CRE WASM
- `@noble/hashes` — works in CRE WASM
- `snarkjs` — has WASM target, uses `@noble/curves` (same dependency chain)

### Fallback Mode: ZK Without CRE

If CRE is unavailable:

| Operation | Fallback |
|-----------|----------|
| Transfer | User generates proof client-side (snarkjs WASM in browser, ~2s) |
| Withdrawal | User generates proof client-side |
| Deposit | No proof needed from CRE — user generates at deposit time |
| Matching | **Paused** — CRE is required for rate decryption |
| Liquidation | **Paused** — CRE is required for DON attestation |
| Interest | **Paused** — last checkpoint remains valid on-chain |

Funds are **never frozen**. Users can always transfer and withdraw. Only
lending operations (which require CRE's confidential compute for rate
decryption) pause during CRE downtime.

---

## 9. Data Flows

### 9.1 Deposit Flow

```
USER                         ON-CHAIN                           CRE
 |                              |                                |
 | Generate locally:            |                                |
 |   salt = random()            |                                |
 |   comm = Poseidon(me,token,  |                                |
 |           amount, salt)      |                                |
 |   proof = Groth16(comm is    |                                |
 |           well-formed)       |                                |
 |   encNote = ecies(CRE_pub,  |                                |
 |             {me,token,amt,   |                                |
 |              salt})          |                                |
 |                              |                                |
 | ERC20.approve(GhostVault)    |                                |
 | GhostVault.deposit(         |                                |
 |   token, amount, comm,      |                                |
 |   encNote, proof)       --->|                                |
 |                              |                                |
 |                     ACEHook.checkDeposit()                    |
 |                     Verify SNARK proof                        |
 |                     safeTransferFrom(user, vault, amount)     |
 |                     Insert comm into Merkle tree              |
 |                     emit NoteCreated(index, comm, encNote)    |
 |                              |                                |
 |                              |-------- NoteCreated event ---->|
 |                              |                                |
 |                              |              CRE decrypts encNote
 |                              |              Indexes: user -> noteComm
 |                              |              Stores (token, amount, salt)
 |                              |                in encrypted note DB
```

### 9.2 Private Transfer Flow (CRE-Executed)

```
CRE (execute-transfers workflow)
 |
 | Has pool's note: {owner=pool, token=gUSD, amount=500, salt=X}
 | Needs to send 500 gUSD to borrower stealth address
 |
 | 1. Compute nullifier for pool's old note:
 |    nullifier = Poseidon(pool_spending_key, note_index, nonce)
 |
 | 2. Create new notes:
 |    new_comm_borrower = Poseidon(stealth_addr, gUSD, 500, salt_new)
 |    (no change note if spending entire amount)
 |
 | 3. Generate transfer proof:
 |    proof = Groth16(
 |      public:  [nullifier, new_comm_borrower, merkle_root]
 |      private: [old_note_preimage, merkle_path, pool_key, new_salt]
 |    )
 |
 | 4. Submit to GhostVault.transfer(
 |      [nullifier],
 |      [new_comm_borrower],
 |      [encrypted_note],
 |      merkle_root,
 |      proof
 |    )
 |
 | ON-CHAIN:
 |   Verify nullifier not spent
 |   Verify SNARK proof
 |   Add nullifier to spent set
 |   Insert new commitment(s) into tree
 |   Update merkle root
 |   emit NoteCreated + NoteNullified
```

### 9.3 Collateral Lock + Match Accept (Atomic)

```
CRE (after borrower accepts proposal, or auto-accept on timeout)
 |
 | GhostRouter.onMatchAccepted(
 |   loanHash,
 |   collateralNoteCommitment,
 |   loanRecord,           // {borrowerHash, principalComm, collateralComm, rate, maturity, ...}
 |   nullifiers,           // pool note(s) being spent for disbursement
 |   newCommitments,       // borrower receives principal
 |   encryptedNotes,
 |   merkleRoot,
 |   transferProof,        // SNARK: valid disbursement transfer
 |   attestation           // DON threshold sig over entire payload
 | )
 |
 | GhostRouter atomically:
 |   1. CollateralManager.lockCollateral(loanHash, collateralNote, attestation)
 |      → Marks note as locked, cannot be spent
 |   2. LoanLedger.createLoan(loanHash, record, attestation)
 |      → On-chain loan record created
 |   3. GhostVault.transfer(nullifiers, newComms, ..., transferProof)
 |      → Principal disbursed from pool to borrower
 |
 | All three succeed or all revert (atomic).
```

### 9.4 Repayment Flow

```
BORROWER                     GHOST SERVER              CRE                ON-CHAIN
 |                              |                       |                    |
 | Transfer repayment to pool   |                       |                    |
 | (client-side transfer proof) |                       |                    |
 |--- GhostVault.transfer() ---|------ event --------->|                    |
 |                              |                       |                    |
 | POST /repay {loanId, sig}-->|                       |                    |
 |                              |-- notify CRE -------->|                    |
 |                              |                       |                    |
 |                              |        CRE verifies repayment amount      |
 |                              |        CRE generates interest proof       |
 |                              |        CRE generates lender payout proofs |
 |                              |                       |                    |
 |                              |        GhostRouter.onRepayment(           |
 |                              |          loanHash,                        |
 |                              |          collateralNote,                  |
 |                              |          nullifiers,     // pool→lenders  |
 |                              |          newCommitments,  // lender notes |
 |                              |          interestProof,                   |
 |                              |          transferProof,                   |
 |                              |          attestation                      |
 |                              |        )              |                    |
 |                              |                       |                    |
 |                              |                       | ON-CHAIN:          |
 |                              |                       | 1. Verify interest |
 |                              |                       |    proof           |
 |                              |                       | 2. Mark loan repaid|
 |                              |                       | 3. Release collat. |
 |                              |                       | 4. Execute lender  |
 |                              |                       |    transfers       |
```

### 9.5 Liquidation Flow

```
CRE (check-loans, every 60s)
 |
 | Read ETH/USD from Chainlink price feed (Arbitrum, EVMClient)
 | Fetch active loans from LoanLedger.sol (on-chain read)
 | For each loan:
 |   Open collateral commitment (CRE has the preimage)
 |   healthRatio = (collateral * ethPrice) / principal
 |   if healthRatio < liquidationThreshold:
 |
 |   1. Generate liquidation proof:
 |      SNARK proves collateral_value < principal * threshold
 |
 |   2. Generate redistribution proofs:
 |      - 5% protocol fee → new pool note
 |      - 95% pro-rata to lenders (higher-rate ticks absorb loss first)
 |      - Each lender gets a new note commitment
 |
 |   3. GhostRouter.onLiquidation(
 |        loanHash,
 |        priceAttestation,    // DON-signed ETH/USD
 |        liquidationProof,    // SNARK: undercollateralized
 |        nullifiers,          // collateral note spent
 |        newCommitments,      // lender distribution notes
 |        transferProof,       // SNARK: valid redistribution
 |        attestation          // DON sig
 |      )
 |
 | ON-CHAIN (atomic):
 |   1. Verify liquidation proof (health < threshold)
 |   2. Verify price attestation (Chainlink DON sig)
 |   3. CollateralManager.liquidate() — seize locked note
 |   4. GhostVault.transfer() — redistribute to lenders
 |   5. LoanLedger.markDefaulted()
 |
 | POST /internal/liquidate-loans → GHOST server
 |   Server updates credit score (downgrade tier)
```

---

## 10. State Management

```
+───────────────────────────+──────────────────────────────────────────────+
|  LOCATION                 |  STATE                                       |
+───────────────────────────+──────────────────────────────────────────────+
|                           |                                              |
|  ON-CHAIN (GhostVault)    |  Merkle root of all note commitments         |
|                           |  Nullifier set (which notes are spent)       |
|                           |  Next leaf index                             |
|                           |  SNARK verifier contract addresses           |
|                           |                                              |
|  ON-CHAIN (Collateral)    |  Locked note set (noteComm -> loanHash)      |
|                           |  Circuit breaker counter                     |
|                           |                                              |
|  ON-CHAIN (LoanLedger)    |  Loan records (hashed borrower, committed    |
|                           |    principal/collateral, aggregate rate,      |
|                           |    maturity, status)                         |
|                           |  Interest checkpoints (accrued per loan)     |
|                           |                                              |
|  ON-CHAIN (NOT stored)    |  Individual balances (hidden in commitments) |
|                           |  Transfer amounts (hidden in proofs)         |
|                           |  Who transferred to whom (hidden)            |
|                           |  Individual lender rates (only aggregate)    |
|                           |                                              |
+───────────────────────────+──────────────────────────────────────────────+
|                           |                                              |
|  CRE (Confidential)       |  CRE private key (rate decryption)           |
|                           |  Pool spending key (for note transfers)      |
|                           |  Decrypted lender rates (ephemeral)          |
|                           |  Pool note inventory (preimages: token,      |
|                           |    amount, salt — needed to spend notes)     |
|                           |  Merkle witness cache                        |
|                           |                                              |
+───────────────────────────+──────────────────────────────────────────────+
|                           |                                              |
|  GHOST SERVER (in-memory)  |  depositSlots, activeBuffer, borrowIntents,  |
|                           |    matchProposals, loans, creditScores       |
|                           |    (all existing, unchanged)                 |
|                           |                                              |
|                           |  NEW: noteIndex (userId -> noteCommitment[]) |
|                           |  NEW: commitmentTree (full Merkle mirror)    |
|                           |  NEW: interestCheckpoints (mirror of chain)  |
|                           |                                              |
+───────────────────────────+──────────────────────────────────────────────+
|                           |                                              |
|  ZK CIRCUITS (ephemeral)   |  Note preimages (owner, token, amount, salt) |
|                           |  Merkle paths (inclusion proofs)             |
|                           |  Nullifier derivation witnesses              |
|                           |  Transfer amount splits                      |
|                           |                                              |
|  These are PRIVATE INPUTS  |  They exist only in prover memory during     |
|  to ZK proofs              |  proof generation. Never stored anywhere.    |
|                           |                                              |
+───────────────────────────+──────────────────────────────────────────────+
```

---

## 11. Trust Model

```
+───────────────────+────────────────────+────────────────────────────────────+
|  ENTITY           |  TRUSTED FOR       |  VERIFIABLE?                       |
+───────────────────+────────────────────+────────────────────────────────────+
|                   |                    |                                    |
|  GhostVault.sol   |  Correct state     |  YES — all transitions require     |
|  (on-chain)       |  transitions,      |  SNARK proofs verified on-chain.   |
|                   |  nullifier         |  Anyone can audit the contract.    |
|                   |  tracking,         |  Deposits/withdrawals are ERC20    |
|                   |  ERC20 custody     |  balance-verifiable.               |
|                   |                    |                                    |
+───────────────────+────────────────────+────────────────────────────────────+
|                   |                    |                                    |
|  CRE (DON)        |  Rate decryption,  |  PARTIALLY — CRE runs in           |
|                   |  matching engine   |  confidential compute (TEE/MPC).   |
|                   |  fairness, pool    |  Matching results verified by ZK   |
|                   |  note management,  |  proofs on-chain. Rate decryption  |
|                   |  proof generation  |  itself is trusted to CRE, but     |
|                   |                    |  threshold secret sharing means no |
|                   |                    |  single DON node sees all data.    |
|                   |                    |                                    |
+───────────────────+────────────────────+────────────────────────────────────+
|                   |                    |                                    |
|  GHOST Server     |  Availability,     |  NO trust required for correctness.|
|                   |  intent ordering,  |  Server cannot:                    |
|                   |  metadata storage  |    - Read encrypted rates          |
|                   |                    |    - Forge ZK proofs               |
|                   |                    |    - Move funds (no spending key)  |
|                   |                    |    - Alter on-chain state          |
|                   |                    |  Worst case: DoS (refuse to serve  |
|                   |                    |  intents). Mitigated by DA layer.  |
|                   |                    |                                    |
+───────────────────+────────────────────+────────────────────────────────────+
|                   |                    |                                    |
|  Users (Client)   |  Generate valid    |  YES — proofs verified on-chain.   |
|                   |  deposit proofs,   |  Invalid proofs rejected. Users    |
|                   |  keep note salts   |  must backup salts (losing them    |
|                   |  safe              |  = losing access to funds).        |
|                   |                    |                                    |
+───────────────────+────────────────────+────────────────────────────────────+
|                   |                    |                                    |
|  Chainlink Feeds  |  Accurate ETH/USD  |  YES — decentralized oracle        |
|                   |  for liquidation   |  network. DON-signed attestations. |
|                   |                    |                                    |
+───────────────────+────────────────────+────────────────────────────────────+

TRUST ASSUMPTIONS:
  1. ZK soundness:        SNARK proofs are computationally sound
  2. CRE confidentiality: Chainlink DON threshold encryption protects secrets
  3. Liveness:            At least CRE OR user must be online (fallback mode)
  4. Server honesty:      Only for availability, not correctness
  5. Note security:       Users must backup note salts / spending keys
```

### Improvement Over Current System

| Dimension | Current (Trust-Based) | Proposed (ZK-Verified) |
|-----------|----------------------|----------------------|
| Balance correctness | Trust external API operator | On-chain SNARK verification |
| Collateral custody | Trust server not to release | Smart contract lock (CollateralManager) |
| Liquidation validity | Trust CRE's HTTP POST | On-chain proof: health < threshold |
| Matching fairness | Trust CRE completely | On-chain proof: sorted + blended rate valid |
| Interest accuracy | Trust server computation | On-chain proof: sum(tick * (1+rate)) |
| Fund freezing risk | API operator can freeze | Users can always withdraw via client proofs |

---

## 12. Compliance (ZK-KYC)

Chainlink ACE integration is preserved and enhanced with zero-knowledge KYC.

### Current: PolicyEngine on Deposit/Withdraw

The existing vault calls `IPolicyEngine.run()` on every deposit and withdrawal.
We keep this for the custom vault via `ACEHook.sol`.

### New: ZK-KYC Attestations

For private transfers (where sender/recipient are hidden), compliance can be
enforced without revealing identity:

```
1. User completes KYC with approved attestor (e.g., Chainlink ACE)
2. Attestor signs: sig = Sign(attestor_key, Poseidon(user_addr, tier, expiry))
3. User generates ZK proof:
     "I have a valid KYC attestation from an approved attestor,
      and my tier allows this operation"
4. Public inputs:  attestor_address, operation_type, current_timestamp
5. Private inputs: user_address, tier, expiry, attestor_signature
6. On-chain verifier: checks SNARK proof + attestor in approved set
```

The contract knows "someone with valid KYC performed this transfer" but not who.
Regulators with the attestor's records can still audit if required — selective
disclosure without on-chain deanonymization.

---

## 13. Gas Analysis

### Per-Operation Gas Costs

| Operation | SNARK Verify | Commitment Update | Nullifier | Merkle | ACE Hook | Total |
|-----------|-------------|-------------------|-----------|--------|----------|-------|
| Deposit | 220K | 12K | — | 30K | 25K | ~287K |
| Transfer | 220K | 12K | 22K | 30K | — | ~284K |
| Withdraw | 220K | — | 22K | — | 25K | ~267K |
| Lock Collateral | — | 12K | — | — | — | ~35K* |
| Liquidate | 220K | 24K (2 new) | 22K | 30K | — | ~296K |
| Repay (10 ticks) | 300K (PLONK) | 36K (3 new) | 22K | 30K | — | ~388K |
| Match Accept (atomic) | 220K+220K | 48K | 44K | 60K | — | ~592K |

*Lock only requires attestation verification (~35K for ECDSA recovery), not a SNARK.

### Comparison

| Protocol | Deposit | Transfer | Withdraw |
|----------|---------|----------|----------|
| Current Chainlink Vault | ~80K | off-chain (0 gas) | ~120K |
| GhostVault (proposed) | ~287K | ~284K | ~267K |
| Tornado Cash | ~900K | — | ~300K |
| Aztec Connect | ~500K | ~500K | ~500K |

GhostVault is more expensive than the current vault (which does no on-chain
privacy) but significantly cheaper than Tornado Cash and competitive with Aztec.
The tradeoff: cryptographic privacy guarantees instead of trust-based privacy.

### On L2 (Arbitrum/Base)

All gas costs drop ~50-100x when deployed on L2:
- Transfer: ~284K gas on L2 = ~$0.02-0.05
- Match accept: ~592K gas on L2 = ~$0.05-0.10

---

## 14. Scaling Strategy

### Phase 1: Sepolia L1 (Current Chain)

- Deploy GhostVault + supporting contracts on Sepolia
- Groth16 proofs, ~220K gas per verification
- Acceptable for testnet and demo
- Merkle tree depth 20 (~1M notes)

### Phase 2: L2 Migration (Arbitrum or Base)

- Move GhostVault to L2 for 50-100x cheaper operations
- Same security (L1 settlement via rollup)
- CRE already reads Arbitrum (check-loans uses Arbitrum price feed)
- Transfer cost: ~$0.02-0.05 per operation

### Phase 3: Proof Aggregation + Batching

```
Instead of:                     Do this:
  tx1: verify(proof1)           Relayer batches N proofs
  tx2: verify(proof2)           Recursive SNARK: verify all N, produce 1 aggregate proof
  tx3: verify(proof3)           Single tx: verify(aggregateProof) + updateRoot(newRoot)
  ...
  txN: verify(proofN)

  N * 220K gas                  ~300K + N*20K gas (amortized)
```

Batch window: 10-30 seconds (configurable). At 10 transfers per batch,
amortized cost drops to ~50K gas per transfer.

### Phase 4: Dedicated DA Layer

Move intent/metadata storage from GHOST server to a DA layer (EigenDA, Celestia,
or Chainlink's own DA). Server becomes stateless — reads from DA, writes to DA.
Eliminates single-point-of-failure.

---

## 15. Migration Plan

### Phase 1: Parallel Deployment (Weeks 1-6)

**Goal:** GhostVault runs alongside existing Chainlink vault. Both work.

```
Week 1-2: Smart Contracts
  - Deploy GhostVault.sol, CollateralManager.sol, LoanLedger.sol on Sepolia
  - Deploy Groth16 verifier contracts (circom/snarkjs)
  - Deploy ACEHook.sol with existing PolicyEngine
  - Zero changes to existing server or CRE

Week 3-4: Server Additions
  - Add commitmentTree mirror to state.ts (synced via events)
  - Add noteIndex tracking (userId -> noteCommitments)
  - Add v2 routes alongside v1:
      POST /v2/deposit/init      (generates salt, returns commitment params)
      POST /v2/deposit/confirm   (records note commitment)
      POST /v2/withdraw          (triggers CRE withdrawal proof)
  - ALL v1 routes keep working (backward compatible)
  - Add Relayer process (event listener + batch submitter)

Week 5-6: CRE Workflow Updates
  - execute-transfers: dual backend support
      if (transfer.backend === "cpt")   → existing external API flow
      if (transfer.backend === "vault") → generate ZK proof + submit on-chain
  - Add pool note inventory to CRE (track preimages for spending)
  - Feature flags in CRE config: vaultBackend: "cpt" | "ghost" | "both"
```

### Phase 2: Feature Parity (Weeks 7-10)

**Goal:** GhostVault supports everything the current vault does, plus lending extensions.

```
Week 7-8: Collateral + Liquidation
  - Integrate CollateralManager with borrow flow
  - Update check-loans CRE workflow: CollateralManager.liquidate() with ZK proof
  - Test full liquidation cycle end-to-end

Week 9-10: Client Integration
  - Add snarkjs WASM prover to Next.js client (deposit + transfer proofs)
  - Stealth address derivation in client
  - Note backup/recovery UX (encrypted salt export)
  - Update all EIP-712 types
```

### Phase 3: Standalone (Weeks 11-14)

**Goal:** Remove Chainlink CPT vault dependency entirely.

```
Week 11-12: Migration Tool
  - Automated script: for each user with CPT balance,
    withdraw from CPT → deposit into GhostVault
  - CRE-assisted migration (pool wallet facilitates)
  - Atomic migration contract:
      1. CPT.withdrawWithTicket(token, amount, ticket)
      2. GhostVault.deposit(token, amount, commitment, proof)
    Single transaction, no intermediate state.

Week 13-14: Cleanup
  - Remove external-api.ts (CPT wrapper)
  - Remove v1 deposit routes
  - Remove CPT-specific EIP-712 domain
  - Update all CRE workflows to vault-only backend
  - Remove feature flags
```

### New Environment Variables

```env
# server/.env additions
GHOST_VAULT_ADDRESS=0x...
COLLATERAL_MANAGER_ADDRESS=0x...
LOAN_LEDGER_ADDRESS=0x...
GHOST_ROUTER_ADDRESS=0x...
TRANSFER_VERIFIER_ADDRESS=0x...
COLLATERAL_VERIFIER_ADDRESS=0x...
LIQUIDATION_VERIFIER_ADDRESS=0x...
INTEREST_VERIFIER_ADDRESS=0x...
MATCHING_VERIFIER_ADDRESS=0x...
RELAYER_PRIVATE_KEY=...
VAULT_BACKEND=cpt|ghost|both        # Phase 1 feature flag
```

---

## 16. Why Chainlink Should Care

### 1. CRE Becomes More Valuable, Not Less

The custom vault does NOT replace CRE. It makes CRE the essential infrastructure
for privacy-preserving DeFi:

- **Current role:** CRE calls HTTP APIs and signs EIP-712 messages
- **New role:** CRE generates ZK proofs, manages note inventories, produces DON
  attestations, and orchestrates on-chain state transitions

CRE evolves from "confidential API proxy" to "confidential proof engine."

### 2. New CRE Capability: ZKProverCapability

This design motivates adding a `ZKProverCapability` to the CRE SDK:

```typescript
// Proposed CRE SDK addition
const prover = cre.capabilities.ZKProver();
const proof = await prover.prove(runtime, {
    circuit: 'transfer',
    publicInputs: { nullifier, newCommitment, root },
    privateInputs: { balance, salt, spendingKey, merklePath }
});
```

Any CRE workflow could then generate ZK proofs. This is a natural extension of
CRE's confidential compute mission and enables a whole class of new applications.

### 3. Reduces Chainlink Operational Burden

Currently, Chainlink operates the CPT vault API as a centralized service:
- Tracks all private balances
- Processes all transfers
- Issues withdrawal tickets
- Single point of failure

With GhostVault, custody moves to smart contracts verified by ZK proofs.
Chainlink's role becomes the confidential compute layer (CRE) rather than
the custody layer. **Less operational risk, same revenue from CRE usage.**

### 4. ACE/PolicyEngine Preserved

The compliance layer (`ACEHook.sol`) integrates directly with Chainlink's
existing PolicyEngine. Every deposit requires a compliance check. This proves
that privacy and compliance can coexist in a lending context — a key selling
point for institutional adoption.

### 5. Generalizable ASCV Pattern

The GhostVault architecture is a reusable template:

| Application | What Changes | What Stays |
|-------------|-------------|-----------|
| Private DEX | Swap circuits instead of lending circuits | Commitment tree, nullifiers, CRE proofs |
| Private Payroll | Batch payment circuits | Same core vault + CRE |
| Private Insurance | Claim verification circuits | Same |
| Private Voting | Ballot commitments | Same tree + nullifier scheme |

GHOST becomes the **reference implementation** for Application-Specific
Confidential Vaults. Chainlink can offer this as a product: "Build your
privacy-preserving app on CRE + ASCV."

### 6. Competitive Moat

No other oracle network or confidential compute platform has:
- ZK proofs generated inside confidential compute (CRE)
- DON-threshold-signed attestations verified on-chain
- Compliance hooks (ACE) integrated with ZK privacy
- A working lending protocol as proof-of-concept

This is a unique position. The combination of CRE + ZK + ACE is something
only Chainlink can credibly offer.

---

## Appendix A: Circuit Implementation Dependencies

```
circom 2.1+              — circuit compiler (R1CS + WASM witness generator)
snarkjs 0.7+             — Groth16/PLONK prover (has WASM target for CRE)
@noble/curves            — BN254 operations (already in dependency tree via eciesjs)
circomlib (iden3)         — Poseidon hash, MerkleProof, comparators, range checks
```

## Appendix B: Trusted Setup

**Groth16 circuits (Transfer, Collateral, Liquidation):**
- Require per-circuit trusted setup ceremony
- Phase 1: Powers of Tau (universal, reusable)
- Phase 2: Circuit-specific (unique per circuit)
- Production: multi-party ceremony (e.g., 50+ participants)
- Development: single-party setup (insecure but fast)

**PLONK circuits (Interest, Rate Ordering):**
- Universal trusted setup (one ceremony for all PLONK circuits)
- Circuit changes do NOT require new setup
- Recommended for circuits that may evolve (variable tick counts)

## Appendix C: Emergency Mechanisms

```
GhostVault:
  - Granular pause scopes:
      PAUSE_DEPOSITS      = 0x01
      PAUSE_TRANSFERS     = 0x02
      PAUSE_WITHDRAWALS   = 0x04
      PAUSE_LENDING       = 0x08
      PAUSE_ALL           = 0x0F
  - Owner: 3/5 multisig with 48h timelock for upgrades
  - Instant pause (no timelock) for emergency

CollateralManager:
  - Circuit breaker: max 10 liquidations per hour (configurable)
  - If exceeded: pause liquidations, require manual review
  - Prevents flash-loan-driven mass liquidation attacks

LoanLedger:
  - Interest checkpoint staleness check: if no checkpoint in 24h,
    freeze the loan's interest accrual at last known value
  - Prevents interest manipulation via CRE downtime
```

---

*This document is a living proposal. Version 0.1, March 2026.*
*GHOST Protocol — Private P2P Lending with Tick-Based Rate Discovery.*
