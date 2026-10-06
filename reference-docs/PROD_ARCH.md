# GHOST Protocol — Production Architecture

> Private P2P lending with sealed-bid rate discovery on Chainlink CRE.
> Discriminatory-price auction per the tick-based framework from
> "Rate Discovery in Decentralised Lending" (Eli & Alexandre, JBBA 2025).

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER (Wallet + Frontend)                      │
│                                                                       │
│   On-chain:  deposit()  withdraw()  repay()                           │
│   Off-chain: POST /submit-intent (encrypted + EIP-712 signed)        │
│   Fallback:  submitIntent() on-chain (less private)                   │
└───────────┬──────────────────────────────┬───────────────────────────┘
            │ on-chain txs                 │ HTTPS (encrypted intent)
            ▼                              ▼
┌───────────────────────┐    ┌──────────────────────────────────────────┐
│  GhostVault.sol        │    │  CRE (DON Nodes + TEE)                   │
│  (Sepolia)             │    │                                          │
│                        │    │  HTTP Endpoint: /submit-intent           │
│  • deposit()           │    │    → receives encrypted+signed intents   │
│  • withdraw()          │    │    → decrypts inside TEE                 │
│  • repay()             │    │    → verifies EIP-712 signature          │
│  • submitIntent()      │    │    → stores in internal state            │
│    (fallback only)     │    │                                          │
│  • onReport()          │◄───│  Cron Workflows:                         │
│    (DON-signed only)   │    │    • process-intents (30s)               │
│                        │    │    • settle-pools (30s)                  │
│  Holds: all tokens     │    │    • check-loans (60s)                   │
│  Stores: encrypted     │    │    • settle-payouts (30s)                │
│    blobs (fallback)    │    │                                          │
│  Knows: balances,      │    │  Secrets (Vault DON, threshold):         │
│    loans, pools        │    │    • CRE_PRIVATE_KEY (eciesjs)           │
│  Cannot: decrypt       │    │    • DON signing key                     │
│    anything            │    │                                          │
└───────────────────────┘    └──────────────────────────────────────────┘
                                           │
┌──────────────────────────────────────────┼───────────────────────────┐
│  GHOST Server (Off-Chain State Store)     │ reads prices              │
│                                          ▼                           │
│  Dumb encrypted blob server.   ┌──────────────────────────┐         │
│  CRE reads/writes via          │  Chainlink Data Streams    │         │
│  ConfidentialHTTPClient.       │  (ETH/USD, token prices)   │         │
│  Cannot read anything.         └──────────────────────────┘         │
│                                                                      │
│  Stores:                                                             │
│    • Pool-to-borrower mappings                                       │
│    • Borrower shielded addresses                                     │
│    • Intent processing status                                        │
│    • Nonce tracking                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Three actors:**
- **GhostVault contract** — holds funds, enforces rules, receives DON-signed reports
- **CRE (Confidential Compute)** — only entity that reads sealed rates, runs matching, produces signed settlement reports
- **Users** — interact on-chain (deposit/withdraw/repay) and off-chain (submit encrypted intents to DON)

**Server role:** Demoted from "the brain" to a dumb encrypted state store. CRE writes encrypted data to it, CRE reads encrypted data from it. The server cannot read or manipulate any data. If it dies, CRE can rebuild from on-chain events (degraded but functional).

---

## 2. EIP-712 Typed Data Definitions

Every intent is signed with EIP-712 before encryption. CRE verifies the signature inside the TEE after decryption.

### Domain

```
{
  name: "GHOST Protocol",
  version: "1.0",
  chainId: 11155111,
  verifyingContract: <GhostVault address>
}
```

### Intent Types

```
LendBid: [
  { name: "poolId",    type: "uint256" },
  { name: "amount",    type: "uint256" },
  { name: "rate",      type: "uint256" },    // basis points (500 = 5.00%)
  { name: "cancelKey", type: "bytes32" },
  { name: "nonce",     type: "uint256" },
  { name: "deadline",  type: "uint256" }
]

BorrowRequest: [
  { name: "token",                type: "address" },
  { name: "amount",               type: "uint256" },    // K
  { name: "maxRate",              type: "uint256" },    // basis points
  { name: "maturity",            type: "uint256" },    // seconds
  { name: "bookBuildingDuration", type: "uint256" },    // seconds
  { name: "collateralToken",     type: "address" },
  { name: "collateralAmount",    type: "uint256" },
  { name: "disburseToShielded",  type: "address" },    // borrower's shielded address
  { name: "cancelKey",           type: "bytes32" },
  { name: "nonce",               type: "uint256" },
  { name: "deadline",            type: "uint256" }
]

CancelIntent: [
  { name: "intentId",  type: "bytes32" },
  { name: "cancelKey", type: "bytes32" },
  { name: "nonce",     type: "uint256" },
  { name: "deadline",  type: "uint256" }
]
```

**Signature flow:** User signs the typed data → encrypts `(signature + plaintext fields)` with CRE pubkey → submits encrypted blob. CRE decrypts inside TEE → recovers signer from EIP-712 sig → verifies `signer == msg.sender` from the deposit.

---

## 3. GhostVault Smart Contract

### State

```solidity
// --- Fund Safety ---
mapping(address => mapping(address => uint256)) internal balances;       // deposited, withdrawable
mapping(address => mapping(address => uint256)) internal lockedBalances;  // committed to intents, NOT withdrawable

// --- Pools (created by CRE via onReport, not by users directly) ---
struct Pool {
    address token;           // borrow token (e.g. USDC)
    uint256 K;               // target borrow amount
    uint256 maxRateBps;      // ceiling for lender bids (public)
    uint256 maturity;        // loan duration in seconds
    uint256 deadline;        // book building deadline (block.timestamp)
    PoolStatus status;       // Open | Settled | Expired | Cancelled
    // NOTE: no borrower address — stays private in CRE's off-chain store
}
mapping(uint256 => Pool) public pools;
uint256 public nextPoolId;

// --- Loans (created by CRE via onReport on settlement) ---
struct Loan {
    uint256 poolId;
    address token;
    uint256 principal;
    uint256 effectiveRateBps;  // blended rate across all ticks
    uint256 maturity;          // absolute timestamp
    LoanStatus status;         // Active | Repaid | Liquidated
    uint256 repaidAmount;
}
mapping(uint256 => Loan) public loans;
mapping(uint256 => MatchedTick[]) public loanTicks;  // discriminatory: each lender's rate preserved
uint256 public nextLoanId;

struct MatchedTick {
    address lender;
    uint256 amount;
    uint256 rateBps;
}

// --- Encrypted Intents (fallback on-chain submission) ---
mapping(uint256 => bytes) public encryptedIntents;
uint256 public nextIntentId;

// --- DON Authorization ---
address public donAddress;  // authorized DON for onReport
```

### Functions

```solidity
// --- User-Facing (generic, role-agnostic) ---

function deposit(address token, uint256 amount) external
    // transferFrom(msg.sender, vault, amount)
    // balances[msg.sender][token] += amount
    // Emit Deposit(msg.sender, token, amount)

function withdraw(address token, uint256 amount) external
    // require(balances[msg.sender][token] >= amount)
    // balances[msg.sender][token] -= amount
    // transfer(msg.sender, amount)
    // Emit Withdrawal(msg.sender, token, amount)
    // NOTE: cannot withdraw lockedBalances

function repay(uint256 loanId, uint256 amount) external
    // transferFrom(msg.sender, vault, amount)
    // loans[loanId].repaidAmount += amount
    // Emit Repayment(loanId, msg.sender, amount)

function submitIntent(bytes calldata encryptedPayload) external
    // Fallback: stores encrypted blob on-chain (less private than HTTP route)
    // encryptedIntents[nextIntentId++] = encryptedPayload
    // Emit IntentSubmitted(intentId, msg.sender, encryptedPayload, block.timestamp)

// --- DON-Only (receives threshold-signed reports) ---

function onReport(bytes calldata signedReport) external
    // 1. Verify DON threshold signature
    // 2. Decode: (ReportAction action, bytes payload) = abi.decode(report)
    // 3. Execute based on action:
    //
    //    ANNOUNCE_POOL   → store pool params, emit PoolAnnounced
    //    LOCK_FUNDS      → lockedBalances[user][token] += amount
    //                      balances[user][token] -= amount
    //    SETTLE          → create loan, disburse to borrower, lock collateral
    //    EXPIRE          → mark pool expired, unlock all lender funds
    //    UNLOCK          → move lockedBalances back to balances (cancel)
    //    LIQUIDATE       → seize collateral, distribute to lenders
    //    PAYOUT          → distribute repayment to individual lenders at tick rates
```

### Events

```solidity
event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdrawal(address indexed user, address indexed token, uint256 amount);
event Repayment(uint256 indexed loanId, address indexed payer, uint256 amount);
event IntentSubmitted(uint256 indexed intentId, address indexed sender, bytes payload, uint256 timestamp);
event PoolAnnounced(uint256 indexed poolId, address indexed token, uint256 K, uint256 maxRateBps, uint256 maturity, uint256 deadline);
event PoolSettled(uint256 indexed poolId, uint256 indexed loanId);
event PoolExpired(uint256 indexed poolId);
event LoanCreated(uint256 indexed loanId, uint256 indexed poolId, uint256 principal, uint256 effectiveRateBps);
event LoanRepaid(uint256 indexed loanId);
event LoanLiquidated(uint256 indexed loanId);
event FundsLocked(address indexed user, address indexed token, uint256 amount);
event FundsUnlocked(address indexed user, address indexed token, uint256 amount);
```

---

## 4. Soft-Locking via lockedBalances

The contract tracks two balances per user per token:

```
balances[user][token]        — free funds, withdrawable anytime
lockedBalances[user][token]  — committed to active intents, NOT withdrawable
```

**Flow:**

1. User calls `deposit()` → funds go to `balances`
2. User submits intent (lend bid or borrow request)
3. CRE processes intent → validates → submits `LOCK_FUNDS` report
4. Contract atomically: `balances -= amount`, `lockedBalances += amount`
5. User cannot `withdraw()` locked funds

**Unlock triggers:**
- Cancel intent → CRE submits `UNLOCK` report → `lockedBalances -= amount`, `balances += amount`
- Pool expires with no match → CRE submits `EXPIRE` report → all lender locks released
- Loan settles → locked funds move to loan disbursement (lender) or remain as collateral (borrower)

**Why on-chain:** This is the critical fund-safety mechanism. Even if CRE goes down, users can't double-spend their committed funds. The contract is the source of truth for "how much can this user actually withdraw."

---

## 5. Intent Submission Flow (HTTP Proxy via DON Address)

The primary (more private) path for submitting intents bypasses on-chain storage entirely.

```
USER                              DON (CRE WORKFLOW)                    CHAIN
─────                             ──────────────────                    ─────

1. Fetch CRE public key
   GET /cre-public-key ──────────→ returns secp256k1 pubkey

2. Sign intent with EIP-712
   signTypedData(LendBid{...})
     → signature

3. Encrypt (plaintext + sig) with CRE pubkey
   eciesjs.encrypt(pubkey, JSON.stringify({ intent, signature }))
     → encryptedBlob

4. Submit to DON HTTP endpoint
   POST /submit-intent { encryptedBlob }
   ────── HTTPS (encrypted in transit) ──────→

5. Inside TEE:
   decrypt(blob) → plaintext + sig
   recover signer from EIP-712 sig
   validate fields (amount <= balance, nonce fresh, deadline ok)
   read balances from chain ────────────────────────────────────→ callContract()
   store in off-chain state store
   submit LOCK_FUNDS report ────────────────────────────────────→ onReport()

   ←───── { status: "accepted", intentId: "0x..." } ──────
```

**What observers see:** Nothing. No on-chain event for the intent. The only on-chain footprint is the `LOCK_FUNDS` report from the DON, which links to the DON address — not the user.

**Fallback path:** If the DON HTTP endpoint is down, users can call `submitIntent(encryptedPayload)` directly on the contract. Less private (on-chain record linking address to blob) but functional.

---

## 6. CRE Workflows (Stateless Design)

CRE workflows are stateless functions — they execute, return a result, and terminate. No memory between runs. Every execution reconstructs world state from chain + off-chain store.

### Execution Model

```
Every CRE run:
  1. Read ALL encrypted intents (from chain events + off-chain store)
  2. Read ALL pool/loan state from chain (callContract)
  3. Read private mappings from off-chain store (ConfidentialHTTPClient)
  4. Decrypt intents inside TEE (runtime.getSecret → eciesjs decrypt)
  5. Determine what's new vs already processed (diff against on-chain state)
  6. Process (validate, match, settle)
  7. Write results: onReport → chain, encrypted state → off-chain store
  8. Die. No state carried forward.
```

### Workflow: process-intents (every 30s)

Reads new encrypted intents, decrypts, validates, creates pools or registers bids.

```
1. Read unprocessed intents from off-chain store + on-chain events
2. Decrypt each inside TEE
3. For borrow requests:
   a. Validate collateral: read balances from chain, check price via Data Streams
   b. If valid: submit LOCK_FUNDS (collateral) + ANNOUNCE_POOL reports
   c. Write pool-to-borrower mapping to off-chain store
4. For lend bids:
   a. Validate: pool exists, pool is Open, deadline not passed, balance sufficient
   b. Submit LOCK_FUNDS report for lender's amount
   c. Store decrypted bid in off-chain store (for settle-pools to read)
5. For cancels:
   a. Verify cancelKey matches
   b. Submit UNLOCK report
   c. Mark intent cancelled in off-chain store
```

### Workflow: settle-pools (every 30s)

Runs matching engine on pools past their book-building deadline.

```
1. Read all Open pools from chain where block.timestamp > deadline
2. For each pool:
   a. Read all bids from off-chain store
   b. Sort bids cheapest-rate-first
   c. Fill from cheapest until K reached
   d. Check: blendedRate <= maxRateBps
   e. If sufficient liquidity:
      → Submit SETTLE report: create loan, disburse principal to borrower's shielded address
      → Each lender's tick rate preserved (discriminatory pricing)
   f. If insufficient liquidity:
      → Submit EXPIRE report: unlock all lender funds, unlock borrower collateral
```

### Workflow: check-loans (every 60s)

Monitors active loans for liquidation.

```
1. Read all Active loans from chain
2. For each loan:
   a. Read collateral value via Chainlink Data Streams
   b. Compute health: collateralValueUSD / loanValueUSD
   c. If health < liquidationThreshold:
      → Submit LIQUIDATE report
      → Collateral distributed to lenders (higher-rate ticks absorb loss first)
```

### Workflow: settle-payouts (every 30s)

Distributes repayments to individual lenders.

```
1. Read Repayment events from chain
2. For each repaid loan:
   a. Read loanTicks from chain
   b. Calculate each lender's share: principal + interest at their individual tick rate
   c. Submit PAYOUT report: credit each lender's balances[lender][token]
   d. If fully repaid: unlock borrower's collateral
```

---

## 7. Complete Flow Diagrams

### Lender Flow

```
1. DEPOSIT
   Lender → vault.deposit(USDC, 500000)
   Chain:   balances[lender][USDC] += 500000
   Visible: "0xLENDER deposited 500k USDC" (purpose unknown)

2. SUBMIT BID
   Lender → encrypt({ type: "lend", poolId: 7, amount: 500000, rate: 500 }, CRE_PUBKEY)
   Lender → POST /submit-intent { encryptedBlob }
   CRE:     decrypts → validates → LOCK_FUNDS report
   Chain:   balances[lender][USDC] -= 500000
            lockedBalances[lender][USDC] += 500000
   Visible: "DON locked 500k USDC for 0xLENDER" (no rate, no pool link visible)

3a. MATCHED
   CRE settle-pools → SETTLE report
   Chain:   loan created, lockedBalances[lender] zeroed, funds disbursed to borrower
   Lender earns their individual tick rate (discriminatory)

3b. NOT MATCHED (pool expired)
   CRE settle-pools → EXPIRE report
   Chain:   lockedBalances[lender][USDC] -= 500000
            balances[lender][USDC] += 500000
   Lender withdraws freely
```

### Borrower Flow

```
1. DEPOSIT COLLATERAL
   Borrower → vault.deposit(ETH, 10)
   Chain:     balances[borrower][ETH] += 10
   Visible:   "0xBORROWER deposited 10 ETH" (could be anything)

2. CREATE POOL
   Borrower → encrypt({ type: "borrow", K: 450000, maxRate: 800, maturity: 30d, ... }, CRE_PUBKEY)
   Borrower → POST /submit-intent { encryptedBlob }
   CRE:       decrypts → validates collateral (price feed check) → LOCK_FUNDS + ANNOUNCE_POOL
   Chain:     pool created (token, K, maxRate, maturity, deadline visible)
              lockedBalances[borrower][ETH] += 10
              balances[borrower][ETH] -= 10
   Visible:   "New pool: 450k USDC, max 8%, 30d" — borrower address NOT linked to pool on-chain

3. BOOK BUILDING
   Lenders see pool → submit sealed bids → CRE locks their funds
   (5min–24h depending on bookBuildingDuration)

4a. SETTLEMENT (sufficient liquidity)
   CRE:     sorts bids cheapest-first, fills to K, checks blended rate
   Chain:   loan created, principal disbursed to borrower's shielded address
            collateral stays locked until repayment

4b. EXPIRY (insufficient liquidity)
   CRE:     EXPIRE report
   Chain:   all locks released (lenders + borrower)
```

### Cancel Flow

```
LENDER CANCEL (before pool settles):
  Lender → encrypt({ type: "cancel", intentId, cancelKey }, CRE_PUBKEY)
  Lender → POST /submit-intent { encryptedBlob }
  CRE:     verifies cancelKey → UNLOCK report
  Chain:   lockedBalances[lender] -= amount
           balances[lender] += amount
  Lender → vault.withdraw(token, amount)

BORROWER CANCEL (before pool settles):
  Same flow. Pool gets cancelled via onReport.
  All lender locks released. Borrower collateral unlocked.
```

### Repayment Flow

```
1. Borrower → vault.repay(loanId, principalPlusInterest)
   Chain:     transferFrom(borrower, vault, amount)
              loans[loanId].repaidAmount += amount

2. CRE settle-payouts reads Repayment event
   For each lender tick:
     amount_owed = tick.amount + (tick.amount * tick.rateBps * elapsed / 10000 / YEAR)
   Submit PAYOUT report

3. Chain:
   balances[lenderA][USDC] += their_share
   balances[lenderB][USDC] += their_share
   (each at their individual tick rate — discriminatory)
   If fully repaid: lockedBalances[borrower][ETH] -= collateral
                    balances[borrower][ETH] += collateral

4. Lenders withdraw at their leisure
```

### Liquidation Flow

```
CRE check-loans (every 60s):
  Read loan → check collateral via Data Streams
  If health < threshold:
    Submit LIQUIDATE report
    Chain: seize collateral
           Higher-rate ticks absorb losses first (riskier lenders take the hit)
           Lower-rate ticks protected
           Loan marked Liquidated
```

---

## 8. State Location Map

### On-Chain (GhostVault — public, trustless, verifiable)

| State | Why On-Chain |
|---|---|
| `balances[user][token]` | Fund safety — prevents double-spend, enables self-service withdrawal |
| `lockedBalances[user][token]` | Prevents withdrawal of committed funds even if CRE is down |
| `pools[poolId]` | Public pool params for lender visibility (token, K, maxRate, maturity, deadline) |
| `loans[loanId]` | Loan terms, repayment tracking, status |
| `loanTicks[loanId]` | Per-lender amounts and rates for discriminatory payout |
| `encryptedIntents[]` | Fallback storage for on-chain intent submission |

**Note:** `balances` and `lockedBalances` use `internal` visibility — no public getter. CRE reads raw storage slots. Raises the bar for casual observers.

### Off-Chain Store (GHOST Server — private, CRE-encrypted)

| State | Why Off-Chain |
|---|---|
| Pool-to-borrower mapping | Privacy — linking borrower address to pool on-chain reveals identity |
| Borrower shielded addresses | Disburse destination, sensitive |
| Decrypted bid books per pool | Too expensive to store on-chain, only CRE needs them |
| Intent processing status | Cheaper than marking on-chain per intent |
| Nonce tracking per user | Replay protection for off-chain intent submission |

**Key property:** The server stores CRE-encrypted blobs. It cannot read, modify, or interpret any data. It's a key-value store with zero semantic understanding.

### Encrypted On-Chain (fallback only)

| State | Why |
|---|---|
| `encryptedIntents[]` | Tamper-proof fallback when DON HTTP endpoint is unavailable |

---

## 9. Privacy Model

### What's Visible On-Chain

| Data | Visibility | Notes |
|---|---|---|
| Deposits/withdrawals | Address + amount visible | Purpose unknown (lend capital? collateral? parking funds?) |
| Pool parameters | Token, K, maxRate, maturity, deadline | Borrower address NOT linked |
| Loan creation | Principal, blended rate, maturity | Created via DON report, not user tx |
| Lender tick rates | Visible post-settlement | Auction is over — no strategic value |
| Repayments | Amount visible | Payer visible (borrower) |
| Liquidations | Visible | Collateral distribution visible |

### What's Hidden

| Data | Hidden From | How |
|---|---|---|
| Lender bid rates (pre-settlement) | Everyone except CRE | eciesjs encryption, decrypted only inside TEE |
| Borrower identity (which address created which pool) | On-chain observers | Pool-to-borrower mapping stored only in CRE's off-chain store |
| Intent type (lend vs borrow) | On-chain observers | Encrypted blob — same `submitIntent` function for all types |
| Who lent to whom | Casual observers | Only visible in loanTicks post-settlement |
| Borrower maxRate (actual value) | Everyone forever | CRE checks `blended <= max` and discards. Never written anywhere. |

### Privacy Degradation Vectors

| Attack | Mitigation |
|---|---|
| Deposit-to-pool correlation ("10 ETH deposit → 10 ETH collateral pool") | Weakens with more users depositing various amounts |
| Timing correlation (deposit then pool appears) | Users can deposit well in advance; many deposits per block |
| `internal` storage slot reading | Raises bar vs public getter, but determined observers can read raw slots |

---

## 10. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 1: On-Chain Contract                                 │
│                                                                      │
│  TRUSTS: DON signature on reports (verified cryptographically)       │
│  DOES NOT TRUST: users (checks balances), server (doesn't talk to   │
│    it), CRE logic (only verifies signature, not computation)         │
│                                                                      │
│  Guarantee: Funds can only move via user action OR valid DON report  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 2: CRE / TEE                                        │
│                                                                      │
│  TRUSTS: Chain state (reads via EVMClient), TEE hardware isolation,  │
│    Vault DON for secret reconstruction, Data Streams for prices      │
│  DOES NOT TRUST: individual DON node operators (threshold signing),  │
│    off-chain store integrity (validates against chain state),         │
│    user inputs (verifies EIP-712 sigs + balances)                    │
│                                                                      │
│  Guarantee: Sealed rates visible only inside TEE. Key wiped after    │
│    execution. Node operators cannot peek.                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 3: Off-Chain Store (GHOST Server)                    │
│                                                                      │
│  TRUSTS: nothing — it's a dumb blob store                            │
│  TRUSTED BY: CRE (for availability, not integrity)                   │
│                                                                      │
│  Guarantee: None. If compromised, CRE detects stale/tampered data   │
│    by cross-referencing chain state. Availability loss degrades      │
│    performance but doesn't compromise funds (on-chain locks hold).   │
│                                                                      │
│  Cannot: read encrypted data, forge intents, move funds, influence   │
│    matching, decrypt rates, link users to intents                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 4: Users                                             │
│                                                                      │
│  TRUST: contract for fund safety, CRE for fair matching,             │
│    TEE for rate privacy                                              │
│  DO NOT NEED TO TRUST: server (can't read their data),               │
│    other users (sealed bids prevent gaming),                         │
│    individual DON nodes (threshold prevents single-node attack)      │
└─────────────────────────────────────────────────────────────────────┘
```

### Failure Modes

| Component Down | Impact | Recovery |
|---|---|---|
| GHOST Server | CRE can't read off-chain state. New intents via HTTP fail. | Fallback: on-chain `submitIntent()`. CRE uses chain-only data (degraded). |
| CRE / DON | No new pools, no matching, no liquidation. | Funds safe on-chain. Users can still withdraw unlocked balances. Locked funds wait for CRE recovery. |
| Single DON node | No impact — threshold signing continues with remaining nodes. | Automatic. |
| TEE compromise | Sealed rates exposed to attacker. | CRE key rotation. Existing loans unaffected (rates already settled). |
| GhostVault bug | Fund loss possible. | Audit, formal verification, upgrade proxy pattern. |

---

## 11. Differences from Hackathon Architecture

| Dimension | Hackathon (current) | Production |
|---|---|---|
| Fund custody | Pool wallet (single private key) | GhostVault contract (trustless) |
| Fund verification | User claims transfer, server believes | `transferFrom` — succeeds or reverts |
| State persistence | In-memory Maps (crash = gone) | On-chain + encrypted off-chain store |
| CRE role | Advisor (tells server what to do) | Autonomous settler (writes chain directly via onReport) |
| Intent submission | Server HTTP endpoints | DON HTTP endpoint (more private) + on-chain fallback |
| Balance tracking | Server tracks (trusted) | On-chain `balances` + `lockedBalances` (trustless) |
| Cancellation | Server-mediated pool wallet transfer | Self-service: CRE verifies cancelKey → UNLOCK report |
| Privacy | Rates hidden from server only | Rates hidden from everyone. Borrower identity hidden. Intent type hidden. |
| Server authority | Full write authority over state | Zero write authority. Dumb blob store. |
