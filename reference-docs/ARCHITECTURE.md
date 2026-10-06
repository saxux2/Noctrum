# GHOST Protocol — Private P2P Lending with Tick-Based Rate Discovery

> Fixed-rate, **discriminatory-price**, continuous-matching lending overlay
> built on top of the Chainlink Compliant Private Transfer vault + API.
> Rate discovery follows the tick-based framework from
> "Rate Discovery in Decentralised Lending" (Eli & Alexandre, JBBA 2025).

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  EXTERNAL LAYER  (Chainlink Compliant Private Transfer)             │
│                                                                     │
│  Vault: 0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13  (Sepolia)       │
│  API:   convergence2026-token-api.cldev.cloud                       │
│                                                                     │
│  Provides: deposit, withdraw, private-transfer, balances,           │
│            shielded-address                                         │
│  Auth:    EIP-712 typed-data signatures                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  private-transfer / balances / withdraw
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  GHOST API SERVER  (Hono + Bun)                                     │
│                                                                     │
│  Dumb storage + fund movement. Stores encrypted intents,            │
│  executes transfers via pool wallet when CRE tells it to.           │
│  Cannot read encrypted rates.                                       │
│                                                                     │
│  Holds POOL_PRIVATE_KEY — pool wallet on external API.              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  ConfidentialHTTPClient
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  CRE  (Chainlink Confidential Compute) — THE BRAIN                  │
│                                                                     │
│  Holds CRE private key (eciesjs secp256k1).                         │
│  Decrypts sealed rates. Runs matching engine.                       │
│  Executes loans directly (disburse via external API).               │
│  Records results back to server for bookkeeping.                    │
│                                                                     │
│  matching:    continuous — triggered on new intents                  │
│  liquidation: POST /internal/check-loans (every 60s)                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Dimension      | Design                               | Why                                                                                              |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Auction format | Discriminatory-price                 | Each lender earns their own rate. No gaming, no collusion.                                       |
| Bid visibility | Sealed (encrypted with CRE pubkey)   | Rates hidden from server + other participants. Only CRE decrypts.                                |
| Matching       | Epoch-based batch                    | Borrows batched, sorted largest-K-first, matched against cheapest lends. Two-step accept/reject. |
| Execution      | CRE proposes, borrower confirms      | CRE matches and proposes. Borrower has 5 min to accept/reject. Timeout = auto-accept.            |
| Pool structure | Global tick book                     | Lenders isolated — deposit at their rate, no awareness of borrowers.                             |
| Borrower role  | Submits borrow order with collateral | Accept/reject proposal. Reject = 5% collateral slashed, intent killed.                           |

---

## Encryption Flow (eciesjs)

```
CLIENT                              SERVER                         CRE
──────                              ──────                         ───
GET /cre-public-key                 returns secp256k1 pubkey
                                    (NOT an ETH address)

eciesjs.encrypt(pubkey, rate)
POST /confirm { encryptedRate }     stores opaque blob
                                    CANNOT read it
                                                                   pulls encrypted intents
                                                                   decrypts with privkey
                                                                   sorts borrows largest-K-first
                                                                   sorts lends cheapest-first
                                                                   matches, checks blended rate
                                    POST /internal/record-match-proposals ◄── proposals
                                                                   borrower accepts/rejects
                                                                   timeout → auto-accept
```

CRE keypair is secp256k1 (eciesjs). Server serves the public key. Only CRE has the private key.

---

## How It Works

### Lender Flow (isolated, no awareness of borrowers)

**User actions: 3 sigs first time, 2 returning**

| Step             | Action                                                       | Sig?        |
| ---------------- | ------------------------------------------------------------ | ----------- |
| Approve vault    | ERC20 approve (one-time)                                     | On-chain tx |
| Deposit to vault | vault.deposit()                                              | On-chain tx |
| Init             | POST /deposit-lend/init { account, token, amount } — no auth | None        |
| Private transfer | Transfer to shielded address (external API)                  | EIP-712     |
| Confirm          | POST /deposit-lend/confirm { encryptedRate }                 | EIP-712     |

After confirm, lender's funds sit in the global tick book at their encrypted rate. Withdrawable anytime until matched.

**Cancel (pre-match): 1 sig**

- POST /cancel-lend → pool transfers funds back to user's vault via private-transfer

### Borrower Flow

**User actions: collateral deposit + submit + accept/reject**

| Step            | Action                                                            | Sig?    |
| --------------- | ----------------------------------------------------------------- | ------- |
| Post collateral | Private-transfer collateral to pool                               | EIP-712 |
| Submit borrow   | POST /borrow-intent { K, maxRate (encrypted), token, collateral } | EIP-712 |
| Accept/Reject   | POST /accept-proposal or /reject-proposal                         | EIP-712 |

**Epoch matching (CRE cron):**

1. CRE pulls all pending borrows + active lends
2. Sorts borrows largest-K-first, lends cheapest-rate-first
3. For each borrow: fills from cheapest lends until K reached, only if blended rate ≤ maxRate
4. Locks matched lend ticks, pushes proposals to server

**Between epochs (borrower action window — 5 min):**

- **Accept** → loan created, principal disbursed, lend ticks consumed
- **Reject** → 5% collateral slashed (stays in pool), 95% returned, intent killed, lend ticks freed for next epoch
- **No response (timeout)** → auto-accepted after 5 min

**If insufficient liquidity:**

- Borrow intent stays pending until next epoch

### Matching Engine (inside CRE — epoch-based)

```
EPOCH N:
  Borrows sorted largest-K-first:
    Charlie  600k max 7%
    Eve      200k max 6%

  Lends sorted cheapest-rate-first:
    Alice  500k @ 5%
    Dave   100k @ 5.5%
    Carol  200k @ 6%
    Bob    300k @ 8%

  Charlie (600k, max 7%):
    Alice  500k @ 5%    ✓
    Dave   100k @ 5.5%  ✓  → 600k filled
    Blended rate = (500k*5% + 100k*5.5%) / 600k = 5.08% ≤ 7% ✓
    → Proposal created, lend ticks locked

  Eve (200k, max 6%):
    Carol  200k @ 6%    ✓  → 200k filled
    Blended rate = 6% ≤ 6% ✓
    → Proposal created

BETWEEN EPOCHS (5 min window):
  Charlie accepts → loan created, K disbursed
  Eve rejects → 5% collateral slashed, Carol's tick freed

EPOCH N+1:
  Carol's 200k @ 6% available again + any new intents
```

### Reject Penalty

- **Reject valid proposal** → 5% collateral slashed (stays in pool), intent killed, matched lend ticks freed
- **No response (5 min timeout)** → auto-accepted
- **Cancel before proposal** → full collateral returned

### Repayment

1. Borrower private-transfers payment to pool
2. Borrower POSTs /repay to GHOST API
3. Server credits matched lenders at their **individual tick rates** (discriminatory)
4. On full repayment → collateral released back to borrower via private-transfer

### Liquidation

```
CRE CronTrigger (every 60s)
  → Pull active loans from server
  → Check collateral value vs loan value
  → If undercollateralized:
      Seize collateral
      Higher-rate ticks absorb losses first (riskier lenders)
      Lower-rate ticks protected
```

---

## Token Flow

```
LENDER DEPOSITS
  Alice --vault.deposit()--> on-chain vault
  Alice --private-transfer-> pool shielded address
  Alice --POST /confirm----> server stores encrypted rate in global tick book

BORROWER ARRIVES
  Charlie --private-transfer-> pool (collateral)
  Charlie --POST /borrow-intent { K, encryptedMaxRate }

CRE EPOCH MATCHING
  CRE decrypts all rates
  CRE sorts borrows largest-K-first, lends cheapest-first
  CRE fills lend ticks to K, checks blended rate ≤ maxRate
  CRE: POST /internal/record-match-proposals to server

BORROWER ACCEPTS/REJECTS (5 min window)
  Charlie --POST /accept-proposal  → loan created, K disbursed
  Charlie --POST /reject-proposal  → 5% slashed, 95% returned, lend ticks freed
  (timeout)                        → auto-accepted

REPAYMENT
  Charlie --private-transfer--> pool (principal + interest)
  Charlie --POST /repay
  Server credits Alice at 5%, Dave at 5.5% (their tick rates)
  Server returns collateral to Charlie

CANCEL (lender, pre-match)
  Alice --POST /cancel-lend
  Pool --private-transfer--> Alice (funds returned to vault balance)

LIQUIDATION (alternate path)
  CRE detects unhealthy loan
  Seize collateral → higher-rate ticks absorb loss first
```

---

## Pool Wallet

Single `POOL_PRIVATE_KEY`. All fund custody lives in the external vault — GHOST never holds tokens directly. Pool wallet operations:

- **Receive**: users private-transfer tokens to pool's shielded addresses
- **Disburse**: CRE triggers pool private-transfer to borrower on match
- **Return**: pool private-transfer back to user on cancel/repayment
- **Balance**: query via external API

---

## API Server

Hono + Bun. Dumb storage layer. Cannot decrypt rates.

### User-Facing Routes

| Route                        | Auth    | What it does                                                           |
| ---------------------------- | ------- | ---------------------------------------------------------------------- |
| `POST /deposit-lend/init`    | None    | Generate shielded address, create pending deposit slot                 |
| `POST /deposit-lend/confirm` | EIP-712 | Store encrypted rate, credit internal balance, add to global tick book |
| `POST /cancel-lend`          | EIP-712 | Pool transfers funds back to user, remove intent                       |
| `POST /borrow-intent`        | EIP-712 | Store encrypted borrow order with collateral refs                      |
| `POST /cancel-borrow`        | EIP-712 | Cancel pending borrow intent, return collateral                        |
| `POST /accept-proposal`      | EIP-712 | Accept match proposal → create loan, disburse principal                |
| `POST /reject-proposal`      | EIP-712 | Reject proposal → 5% slash, 95% returned, lend ticks freed             |
| `POST /repay`                | EIP-712 | Full repay, credit lenders at discriminatory rates, release collateral |
| `GET /health`                | None    | Status + pool address                                                  |
| `GET /cre-public-key`        | None    | eciesjs secp256k1 public key for rate encryption                       |

### Internal Routes (called by CRE)

| Route                                   | What it does                                          |
| --------------------------------------- | ----------------------------------------------------- |
| `GET /internal/pending-intents`         | CRE pulls active lends (not locked) + pending borrows |
| `POST /internal/record-match-proposals` | CRE pushes batch of match proposals after epoch       |
| `POST /internal/expire-proposals`       | Auto-accept proposals past 5 min deadline             |
| `POST /internal/check-loans`            | Returns active loans for liquidation check            |

---

## CRE Workflows

### Matching (epoch-based)

```
CRE CronTrigger (epoch interval):
  1. POST /internal/expire-proposals  (auto-accept timed-out proposals first)
  2. GET /internal/pending-intents    (active lends not locked + pending borrows)
  3. Decrypt all rates (eciesjs privkey)
  4. Sort borrows largest-K-first
  5. Sort lends cheapest-rate-first
  6. For each borrow:
       Fill from cheapest lends until K reached
       Only if blended rate ≤ borrower's maxRate
       Lock matched lend ticks (status → "proposed")
  7. POST /internal/record-match-proposals  (push proposals to server)
  8. Borrowers have 5 min to accept/reject
       Accept → loan created, funds disbursed
       Reject → 5% slash, lend ticks freed
       Timeout → auto-accepted next epoch
```

### Liquidation Monitor

```
CronTrigger (every 60s)
  → GET /internal/check-loans from server
  → Check collateral value vs loan value
  → If unhealthy:
      Seize collateral via pool wallet
      Distribute to lenders (higher-rate ticks absorb loss first)
      POST /internal/record-loans with updated state
```

### Why CRE

1. **Only CRE can read rates** — encrypted with its public key, decrypted only inside confidential compute
2. **ConfidentialHTTPClient** — HTTP calls encrypted end-to-end, individual DON nodes can't see data
3. **Vault DON Secrets** — CRE private key stored as threshold-encrypted secret
4. **Executes directly** — CRE doesn't ask server to match; it matches and disburses itself

---

## Privacy Model

| Data              | On-Chain (Public) | GHOST Server        | CRE                 |
| ----------------- | ----------------- | ------------------- | ------------------- |
| Vault deposits    | Visible           | —                   | —                   |
| Private transfers | Hidden            | Known               | Known               |
| GHOST balances    | Hidden            | Tracked             | —                   |
| Lender rates      | Hidden            | Encrypted blob      | **Decrypted**       |
| Borrower max rate | Hidden            | Encrypted blob      | **Decrypted**       |
| Who lent to whom  | Hidden            | Recorded post-match | Known at match      |
| Loan terms        | Hidden            | Recorded            | Known               |
| Liquidation       | Hidden            | Updated by CRE      | Detected + executed |

**Key insight**: The server never sees plaintext rates. It stores encrypted blobs and executes fund movements. All rate logic lives inside CRE's confidential compute boundary.

---

## State

```typescript
// Global lend tick book (rates encrypted, only CRE reads plaintext)
interface LendIntent {
  intentId: string;
  userId: string;
  token: string;
  amount: bigint;
  encryptedRate: string; // eciesjs ciphertext, opaque to server
  shieldedAddress: string;
  status: "active" | "matched" | "cancelled";
  createdAt: number;
}

// Borrow orders
interface BorrowIntent {
  intentId: string;
  borrower: string;
  token: string;
  amount: bigint; // K — target loan amount
  encryptedMaxRate: string; // eciesjs ciphertext
  collateralToken: string;
  collateralAmount: bigint;
  status: "pending" | "proposed" | "matched" | "cancelled" | "rejected";
  createdAt: number;
}

// Match proposal (CRE creates after epoch matching, borrower accepts/rejects)
interface MatchProposal {
  proposalId: string;
  borrowIntentId: string;
  borrower: string;
  token: string;
  principal: bigint;
  matchedTicks: MatchedTick[];
  effectiveBorrowerRate: number;
  collateralToken: string;
  collateralAmount: bigint;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number; // createdAt + 5 min
}

// Loan (created on proposal accept or timeout auto-accept)
interface Loan {
  loanId: string;
  borrower: string;
  token: string;
  principal: bigint;
  matchedTicks: MatchedTick[]; // discriminatory: each lender's rate preserved
  effectiveBorrowerRate: number;
  collateralToken: string;
  collateralAmount: bigint;
  maturity: number;
  status: "active" | "repaid" | "defaulted";
  repaidAmount: bigint;
}

interface MatchedTick {
  lender: string;
  lendIntentId: string;
  amount: bigint;
  rate: number; // plaintext, written by CRE post-match
}

// Deposit slot (shielded address lifecycle)
interface DepositSlot {
  shieldedAddress: string;
  userId: string;
  token: string;
  amount: bigint;
  status: "pending" | "confirmed" | "cancelled";
  encryptedRate?: string;
  createdAt: number; // 10min TTL for pending slots
}
```

---

## Chainlink Services Used

| Service                            | How GHOST Uses It                                                        |
| ---------------------------------- | ------------------------------------------------------------------------ |
| **CRE Workflows**                  | Matching (continuous), liquidation monitoring (60s cron)                 |
| **CRE ConfidentialHTTPClient**     | All CRE↔server and CRE↔external API calls encrypted end-to-end         |
| **CRE Vault DON Secrets**          | CRE eciesjs private key as threshold-encrypted secret                    |
| **ACE (PolicyEngine)**             | Compliance check on token deposits to external vault                     |
| **Compliant Private Transfer API** | Base layer: private transfers, balances, withdrawals, shielded addresses |

---

## Environment Variables

### GHOST Server (`server/.env`)

| Var                      | Description                                                            |
| ------------------------ | ---------------------------------------------------------------------- |
| `POOL_PRIVATE_KEY`       | Pool wallet private key (required)                                     |
| `TOKEN_ADDRESS`          | Deployed token address (required)                                      |
| `CRE_PUBLIC_KEY`         | eciesjs secp256k1 public key for rate encryption (required)            |
| `EXTERNAL_API_URL`       | External API base URL (default: convergence2026-token-api.cldev.cloud) |
| `EXTERNAL_VAULT_ADDRESS` | External vault contract (default: 0xE588...)                           |
| `CHAIN_ID`               | Chain ID (default: 11155111)                                           |
| `PORT`                   | Server port (default: 3000)                                            |
| `INTERNAL_API_KEY`       | API key for CRE internal routes (optional)                             |

### CRE Secrets (Vault DON)

| Secret             | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `CRE_PRIVATE_KEY`  | eciesjs secp256k1 private key for decrypting sealed rates |
| `POOL_PRIVATE_KEY` | Pool wallet key for executing transfers                   |

---

## Directory Structure

```
ghost/
├── ARCHITECTURE.md
│
├── server/                          ← GHOST API Server (Hono + Bun)
│   ├── src/
│   │   ├── index.ts                 ← entry, health, /cre-public-key
│   │   ├── config.ts                ← env vars
│   │   ├── auth.ts                  ← EIP-712 verify (Confirm Deposit, Cancel Lend)
│   │   ├── state.ts                 ← balances, deposit slots, intents, loans
│   │   ├── types.ts                 ← LendIntent, BorrowIntent, Loan, DepositSlot
│   │   ├── external-api.ts          ← wraps external API: shielded-address, transfer, balance, withdraw
│   │   ├── controllers/
│   │   │   ├── lend.controllers.ts      ← initDepositLend, confirmDepositLend, cancelLend
│   │   │   ├── borrow.controllers.ts    ← submitBorrowIntent, cancelBorrow, acceptProposal, rejectProposal
│   │   │   ├── internal.controllers.ts  ← getPendingIntents, recordMatchProposals, expireProposals, checkLoans
│   │   │   └── repay.controllers.ts     ← repayLoan
│   │   └── routes/
│   │       └── ghost.routes.ts      ← route mounting
│   ├── scripts/
│   │   └── real-flow-test.ts        ← end-to-end integration test
│   └── src/__tests__/
│       └── lend.test.ts             ← unit tests (real external API)
│
├── ghost-cre/                       ← CRE Workflows
│   └── src/workflows/
│       ├── matching/                ← decrypts rates, matches, disburses
│       └── liquidation/             ← checks loan health, seizes collateral
│
└── transfer-demo/                   ← Solidity (Foundry) — token + vault scripts
    └── script/
        ├── 01_DeployToken.s.sol
        ├── 04_ApproveVault.s.sol
        ├── 05_RegisterVault.s.sol
        ├── 06_DepositToVault.s.sol
        ├── 07_WithdrawWithTicket.s.sol
        └── SetupAll.s.sol
```
