# GHOST Custom Vault Architecture

## Proposal for Chainlink Team

> Replacing the generic Compliant Private Transfer vault (0xE588...)
> with a lending-native vault that GHOST controls, while preserving
> the privacy guarantees and CRE integration.

---

## 1. Why a Custom Vault

The current Chainlink Compliant Private Transfer vault provides:

- ERC20 deposit/withdraw
- Private transfers (off-chain balance ledger)
- Shielded addresses
- PolicyEngine compliance checks
- Withdrawal tickets (signed by off-chain API, redeemed on-chain)

What it does NOT provide (and GHOST needs):

- On-chain collateral locking with programmatic release conditions
- Liquidation hooks that CRE can call atomically
- Interest accrual tracked at the vault level
- Discriminatory-rate loan state that survives server restarts
- Verifiable collateral ratios (currently all off-chain, no proof)
- Emergency pause that halts lending without halting withdrawals of free balances

The custom vault keeps the privacy layer (private transfers stay off-chain)
but moves critical lending state on-chain where it can be verified and
where CRE can interact with it via EVMClient.

---

## 2. Architecture Overview

```
                                ON-CHAIN (Sepolia)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  ┌─────────────────────┐    ┌──────────────────────┐                 │
  │  │   GhostVault.sol    │    │ CollateralManager.sol│                 │
  │  │                     │    │                      │                 │
  │  │  deposit()          │    │  lockCollateral()    │                 │
  │  │  withdrawWithTicket │    │  releaseCollateral() │                 │
  │  │  register()         │    │  liquidate()         │                 │
  │  │  totalDeposits[]    │    │  lockedCollateral[]  │                 │
  │  │  policyEngine[]     │    │  loanNonces[]        │                 │
  │  └────────┬────────────┘    └──────────┬───────────┘                 │
  │           │                            │                             │
  │  ┌────────┴────────────────────────────┴───────────┐                 │
  │  │           GhostLoanLedger.sol                   │                 │
  │  │                                                 │                 │
  │  │  createLoan()      — CRE-signed attestation     │                 │
  │  │  recordRepayment() — CRE confirms repay         │                 │
  │  │  markDefaulted()   — CRE triggers liquidation   │                 │
  │  │  getLoanHealth()   — view, anyone can verify    │                 │
  │  │                                                 │                 │
  │  │  Stores: loanId => {principal, collateral,      │                 │
  │  │          maturity, status, repaid}              │                 │
  │  │  Does NOT store: rates, matched ticks, lender   │                 │
  │  │          identities (privacy preserved)         │                 │
  │  └─────────────────────────────────────────────────┘                 │
  │                                                                      │
  │  ┌─────────────────────┐    ┌──────────────────────┐                 │
  │  │  GhostPolicyEngine  │    │  InterestAccrual.sol │                 │
  │  │  .sol               │    │                      │                 │
  │  │                     │    │  computeInterest()   │                 │
  │  │  extends Chainlink  │    │  per-second compound │                 │
  │  │  PolicyEngine       │    │  view-only helper    │                 │
  │  │  + lending rules    │    └──────────────────────┘                 │
  │  └─────────────────────┘                                             │
  └──────────────────────────────────────────────────────────────────────┘

                               OFF-CHAIN
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐    │
  │  │  GHOST Server   │   │  CRE Workflows   │   │  Private Xfer   │    │
  │  │  (Hono + Bun)   │   │  (Chainlink)     │   │  API Layer      │    │
  │  │                 │   │                  │   │                 │    │
  │  │  Encrypted      │   │  settle-loans    │   │  Balances       │    │
  │  │  rate storage   │   │  check-loans     │   │  Shielded addrs │    │
  │  │  Tick book      │   │  execute-xfers   │   │  Private xfers  │    │
  │  │  Match state    │   │  vault-sync      │   │  Withdraw tix   │    │
  │  │  Credit scores  │   │  (NEW)           │   │                 │    │
  │  └────────┬────────┘   └────────┬─────────┘   └────────┬────────┘    │
  │           │                     │                      │             │
  │           └─────────────────────┴──────────────────────┘             │
  │                    ConfidentialHTTPClient + EVMClient                │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 3. On-Chain vs Off-Chain Split

### MUST be on-chain

| Data / Operation             | Why                                             |
| ---------------------------- | ----------------------------------------------- |
| ERC20 deposit into vault     | Token custody, verifiable by anyone             |
| ERC20 withdraw from vault    | Token release, needs ticket + policy check      |
| Collateral lock amounts      | Must be immutable during loan — CRE + borrower  |
|                              | need guarantee funds cannot be withdrawn        |
| Collateral release/liquidate | Atomic — either collateral goes to borrower or  |
|                              | lenders, no race conditions                     |
| Loan existence + status      | Verifiable proof a loan exists, its principal,  |
|                              | collateral, maturity, and current status        |
| PolicyEngine checks          | Compliance on deposit/withdraw                  |
| Emergency pause state        | Must be on-chain to block contract interactions |

### MUST stay off-chain

| Data / Operation           | Why                                            |
| -------------------------- | ---------------------------------------------- |
| Encrypted rates            | Only CRE should decrypt — on-chain = public    |
| Lender identities per loan | Privacy: who lent to whom must remain hidden   |
| Individual tick rates      | Discriminatory pricing is private              |
| Matching engine logic      | Runs in CRE confidential compute               |
| Private transfer balances  | Core privacy feature — off-chain ledger        |
| Credit scores / tiers      | Server-side reputation, not consensus-critical |

### Hybrid (on-chain anchor, off-chain detail)

| Data / Operation | On-chain                  | Off-chain                 |
| ---------------- | ------------------------- | ------------------------- |
| Loan creation    | loanId, principal,        | matchedTicks[], rates,    |
|                  | collateral, maturity,     | lender addresses, blended |
|                  | borrower (hashed), status | rate                      |
| Repayment        | repaid flag + amount      | Per-lender distribution   |
| Interest         | Aggregate rate (blended)  | Per-tick discriminatory   |
|                  | for health checks         | rates                     |

---

## 4. Smart Contract Architecture

### 4.1 GhostVault.sol — Core Deposit/Withdraw

This replaces the Chainlink vault. It holds ERC20 tokens, enforces policy,
and issues withdrawal tickets. The key addition: it can "earmark" balances
for the CollateralManager so they cannot be withdrawn.

```
Contract: GhostVault

Inheritance:
  - Initializable (UUPS upgradeable)
  - UUPSUpgradeable
  - PausableUpgradeable
  - AccessControlUpgradeable

Roles:
  - DEFAULT_ADMIN_ROLE  — multisig, upgrade authority
  - TICKET_SIGNER_ROLE  — off-chain API that signs withdrawal tickets
  - COLLATERAL_ROLE     — CollateralManager contract (lock/release)
  - PAUSER_ROLE         — emergency pause

Storage:
  - mapping(address token => address policyEngine)
  - mapping(address token => uint256 totalDeposited)
  - mapping(address token => uint256 totalLocked)       // earmarked for collateral
  - mapping(bytes32 => bool) usedTickets                 // replay protection
  - uint256 ticketExpiry                                 // default 1 hour
```

### 4.2 CollateralManager.sol — Lock/Release/Liquidate

This is the novel contract. It manages collateral lifecycle:
lock on loan creation, release on repayment, seize on liquidation.
Only CRE (via signed attestations) or the LoanLedger can trigger state changes.

```
Contract: CollateralManager

Inheritance:
  - Initializable (UUPS upgradeable)
  - UUPSUpgradeable
  - AccessControlUpgradeable

Roles:
  - DEFAULT_ADMIN_ROLE
  - CRE_OPERATOR_ROLE   — CRE DON address that can lock/release/liquidate
  - LEDGER_ROLE          — GhostLoanLedger can trigger releases

Storage:
  - mapping(bytes32 loanId => CollateralLock)
  - mapping(address borrower => uint256 totalLocked) per token

  struct CollateralLock {
    address borrower;
    address token;
    uint256 amount;
    uint256 lockedAt;
    LockStatus status;       // Locked | Released | Liquidated
  }
```

### 4.3 GhostLoanLedger.sol — On-Chain Loan Records

Minimal on-chain loan state. Does NOT store who the lenders are
(that stays off-chain for privacy). Stores enough for:

- Collateral health verification (anyone can call getLoanHealth)
- CRE to trigger liquidation with on-chain proof
- Borrower to verify their loan terms

```
Contract: GhostLoanLedger

Inheritance:
  - Initializable (UUPS upgradeable)
  - UUPSUpgradeable
  - AccessControlUpgradeable

Roles:
  - DEFAULT_ADMIN_ROLE
  - CRE_OPERATOR_ROLE    — creates loans, marks defaults
  - REPAYMENT_ROLE       — records repayments (server or CRE)

Storage:
  - mapping(bytes32 loanId => LoanRecord)
  - mapping(address borrower => bytes32[] activeLoanIds)

  struct LoanRecord {
    bytes32 loanId;
    bytes32 borrowerHash;       // keccak256(borrower) for privacy
    address loanToken;
    uint256 principal;
    uint256 aggregateRateBps;   // blended rate in bps (e.g. 508 = 5.08%)
    address collateralToken;
    uint256 collateralAmount;
    uint256 createdAt;
    uint256 maturity;
    uint256 repaidAmount;
    LoanStatus status;          // Active | Repaid | Defaulted
  }
```

### 4.4 GhostPolicyEngine.sol — Lending-Aware Compliance

Extends the Chainlink ACE PolicyEngine with lending-specific rules:

- Borrowers with defaulted loans cannot withdraw collateral tokens
- Locked collateral cannot be withdrawn even with a valid ticket
- KYC/AML checks delegated to base PolicyEngine

```
Contract: GhostPolicyEngine

Inheritance:
  - PolicyEngine (Chainlink ACE)

Additional state:
  - address ghostVault
  - address collateralManager
  - mapping(address => bool) blacklisted     // post-liquidation freeze
```

### 4.5 InterestAccrual.sol — View-Only Math Library

Pure computation contract. No state. Used by LoanLedger and CRE
to compute interest owed at any point in time.

```
Contract: InterestAccrual (library)

Functions:
  - computeSimpleInterest(principal, rateBps, elapsed) => uint256
  - computeCompoundInterest(principal, rateBps, elapsed, periods) => uint256
  - healthRatio(collateralValue, loanValue) => uint256 (18 decimals)
```

---

## 5. Key Contract Interfaces

### 5.1 IGhostVault

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IGhostVault {
    // ── Events ──────────────────────────────────────────
    event Deposited(address indexed account, address indexed token, uint256 amount);
    event Withdrawn(address indexed account, address indexed token, uint256 amount, bytes32 ticketHash);
    event TokenRegistered(address indexed token, address indexed policyEngine);
    event CollateralLocked(address indexed token, uint256 amount);
    event CollateralReleased(address indexed token, uint256 amount);
    event EmergencyPaused(address indexed pauser);
    event EmergencyUnpaused(address indexed admin);

    // ── Errors ──────────────────────────────────────────
    error TokenNotRegistered(address token);
    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientFreeBalance(uint256 free, uint256 requested);
    error TicketExpired(bytes32 ticketHash, uint256 expiry);
    error TicketAlreadyUsed(bytes32 ticketHash);
    error InvalidTicketSignature();
    error PolicyCheckFailed(address token, address account);
    error ZeroAmount();
    error Paused();

    // ── Deposit ─────────────────────────────────────────
    /// @notice Deposit ERC20 tokens into the vault.
    ///         Calls PolicyEngine.checkDeposit() before accepting.
    ///         Emits private balance credit via off-chain API event.
    /// @param token The ERC20 token address
    /// @param amount The amount to deposit (must have prior approval)
    function deposit(address token, uint256 amount) external;

    // ── Withdraw ────────────────────────────────────────
    /// @notice Withdraw tokens using a signed ticket from the off-chain API.
    ///         Ticket contains: (account, token, amount, nonce, expiry, signature).
    ///         Checks that free balance (total - locked) >= amount.
    /// @param token The ERC20 token address
    /// @param amount The amount to withdraw
    /// @param ticket Encoded ticket: abi.encode(nonce, expiry, signature)
    function withdrawWithTicket(
        address token,
        uint256 amount,
        bytes calldata ticket
    ) external;

    // ── Registration ────────────────────────────────────
    /// @notice Register a token with its PolicyEngine. Admin only.
    /// @param token The ERC20 token address
    /// @param policyEngine The PolicyEngine contract for compliance checks
    function register(address token, address policyEngine) external;

    // ── Collateral earmarking (called by CollateralManager) ─
    /// @notice Lock vault balance so it cannot be withdrawn.
    ///         Only callable by COLLATERAL_ROLE (CollateralManager contract).
    /// @param token The token to lock
    /// @param amount The amount to earmark as locked
    function lockBalance(address token, uint256 amount) external;

    /// @notice Release previously locked vault balance.
    ///         Only callable by COLLATERAL_ROLE.
    /// @param token The token to release
    /// @param amount The amount to un-earmark
    function releaseBalance(address token, uint256 amount) external;

    // ── Views ───────────────────────────────────────────
    /// @notice Total deposited for a token (locked + free)
    function totalDeposited(address token) external view returns (uint256);

    /// @notice Total locked as collateral for a token
    function totalLocked(address token) external view returns (uint256);

    /// @notice Free balance available for withdrawal (total - locked)
    function freeBalance(address token) external view returns (uint256);

    // ── Emergency ───────────────────────────────────────
    /// @notice Pause all deposits and withdrawals. PAUSER_ROLE only.
    function pause() external;

    /// @notice Unpause. DEFAULT_ADMIN_ROLE only.
    function unpause() external;
}
```

### 5.2 ICollateralManager

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ICollateralManager {
    // ── Enums ───────────────────────────────────────────
    enum LockStatus { Locked, Released, Liquidated }

    // ── Events ──────────────────────────────────────────
    event CollateralLocked(
        bytes32 indexed loanId,
        address indexed borrower,
        address indexed token,
        uint256 amount
    );
    event CollateralReleased(
        bytes32 indexed loanId,
        address indexed borrower,
        uint256 amount
    );
    event CollateralLiquidated(
        bytes32 indexed loanId,
        address indexed borrower,
        uint256 seized,
        uint256 protocolFee
    );
    event ExcessCollateralClaimed(
        bytes32 indexed loanId,
        address indexed borrower,
        uint256 excess
    );

    // ── Errors ──────────────────────────────────────────
    error LoanAlreadyExists(bytes32 loanId);
    error LoanNotFound(bytes32 loanId);
    error NotLocked(bytes32 loanId);
    error NotBorrower(address caller, address borrower);
    error InvalidAttestation();
    error InsufficientCollateral(uint256 required, uint256 provided);

    // ── Lock collateral (called by CRE via attestation) ─
    /// @notice Lock collateral for a new loan.
    ///         CRE signs an attestation: (loanId, borrower, token, amount, nonce).
    ///         The vault earmarks these funds — borrower cannot withdraw them.
    /// @param loanId Unique loan identifier (from CRE matching)
    /// @param borrower The borrower's address
    /// @param token The collateral token (gUSD or gETH)
    /// @param amount The amount to lock
    /// @param attestation CRE-signed attestation proving this lock is valid
    function lockCollateral(
        bytes32 loanId,
        address borrower,
        address token,
        uint256 amount,
        bytes calldata attestation
    ) external;

    // ── Release collateral (on repayment) ───────────────
    /// @notice Release collateral back to borrower after full repayment.
    ///         Only callable by LoanLedger (LEDGER_ROLE) or CRE (CRE_OPERATOR_ROLE).
    /// @param loanId The loan whose collateral to release
    /// @param recipient The address to release to (usually borrower)
    function releaseCollateral(
        bytes32 loanId,
        address recipient
    ) external;

    // ── Partial release (excess collateral) ─────────────
    /// @notice Allow borrower to claim excess collateral above required ratio.
    ///         Checks current health ratio remains above minimum after release.
    /// @param loanId The loan ID
    /// @param amount The excess amount to release
    /// @param priceAttestation CRE-signed current price for health check
    function claimExcessCollateral(
        bytes32 loanId,
        uint256 amount,
        bytes calldata priceAttestation
    ) external;

    // ── Liquidation ─────────────────────────────────────
    /// @notice Seize collateral for an undercollateralized or matured loan.
    ///         Only callable by CRE_OPERATOR_ROLE.
    ///         5% protocol fee, 95% queued for lender distribution (off-chain).
    /// @param loanId The loan to liquidate
    /// @param priceAttestation CRE-signed price proof for health ratio verification
    function liquidate(
        bytes32 loanId,
        bytes calldata priceAttestation
    ) external;

    // ── Views ───────────────────────────────────────────
    /// @notice Get collateral lock details for a loan
    function getCollateralLock(bytes32 loanId)
        external view returns (
            address borrower,
            address token,
            uint256 amount,
            uint256 lockedAt,
            LockStatus status
        );

    /// @notice Total collateral locked by a borrower for a specific token
    function totalLockedByBorrower(address borrower, address token)
        external view returns (uint256);
}
```

### 5.3 IGhostLoanLedger

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IGhostLoanLedger {
    // ── Enums ───────────────────────────────────────────
    enum LoanStatus { Active, Repaid, Defaulted }

    // ── Events ──────────────────────────────────────────
    event LoanCreated(
        bytes32 indexed loanId,
        bytes32 indexed borrowerHash,
        address loanToken,
        uint256 principal,
        uint256 maturity
    );
    event LoanRepaid(bytes32 indexed loanId, uint256 totalRepaid);
    event LoanDefaulted(bytes32 indexed loanId);
    event RepaymentRecorded(bytes32 indexed loanId, uint256 amount, uint256 totalRepaid);

    // ── Errors ──────────────────────────────────────────
    error LoanExists(bytes32 loanId);
    error LoanNotFound(bytes32 loanId);
    error LoanNotActive(bytes32 loanId);
    error InvalidAttestation();
    error RepaymentExceedsOwed(uint256 repaid, uint256 owed);

    // ── Loan creation (CRE only) ────────────────────────
    /// @notice Record a new loan on-chain. Called by CRE after match acceptance.
    ///         Stores minimal data: no lender info, no individual rates.
    ///         aggregateRateBps is the blended rate for health calculations only.
    /// @param loanId Unique identifier
    /// @param borrowerHash keccak256(abi.encodePacked(borrower)) for privacy
    /// @param loanToken The borrowed token address
    /// @param principal The principal amount
    /// @param aggregateRateBps Blended rate in basis points (for health checks)
    /// @param collateralToken The collateral token address
    /// @param collateralAmount The locked collateral amount
    /// @param maturity Timestamp when loan matures
    /// @param attestation CRE-signed proof
    function createLoan(
        bytes32 loanId,
        bytes32 borrowerHash,
        address loanToken,
        uint256 principal,
        uint256 aggregateRateBps,
        address collateralToken,
        uint256 collateralAmount,
        uint256 maturity,
        bytes calldata attestation
    ) external;

    // ── Repayment recording ─────────────────────────────
    /// @notice Record a partial or full repayment.
    ///         Does NOT distribute to lenders (that is off-chain via private transfers).
    ///         Only updates the aggregate repaid amount for health tracking.
    /// @param loanId The loan ID
    /// @param amount The repayment amount
    /// @param attestation CRE-signed proof (or server-signed with REPAYMENT_ROLE)
    function recordRepayment(
        bytes32 loanId,
        uint256 amount,
        bytes calldata attestation
    ) external;

    // ── Default marking ─────────────────────────────────
    /// @notice Mark a loan as defaulted. Triggers CollateralManager.liquidate().
    ///         Only callable by CRE_OPERATOR_ROLE.
    /// @param loanId The loan ID
    function markDefaulted(bytes32 loanId) external;

    // ── Views ───────────────────────────────────────────
    /// @notice Get full loan record
    function getLoan(bytes32 loanId)
        external view returns (
            bytes32 borrowerHash,
            address loanToken,
            uint256 principal,
            uint256 aggregateRateBps,
            address collateralToken,
            uint256 collateralAmount,
            uint256 createdAt,
            uint256 maturity,
            uint256 repaidAmount,
            LoanStatus status
        );

    /// @notice Compute current health ratio for a loan.
    ///         healthRatio = (collateralValue) / (outstandingDebt)
    ///         Requires an oracle price for cross-token loans (gETH collateral, gUSD loan).
    /// @param loanId The loan ID
    /// @param collateralPrice Price of collateral token in loan token units (18 decimals)
    /// @return healthRatio Scaled to 18 decimals (1e18 = 1.0x, 1.5e18 = 1.5x)
    function getLoanHealth(bytes32 loanId, uint256 collateralPrice)
        external view returns (uint256 healthRatio);

    /// @notice Get all active loan IDs (for CRE polling)
    function getActiveLoanCount() external view returns (uint256);

    /// @notice Check if a loan is past maturity
    function isMatured(bytes32 loanId) external view returns (bool);
}
```

### 5.4 CRE Callback Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICRECallback
/// @notice Interface for CRE to interact with GHOST contracts via EVMClient.
///         CRE uses encodeCallMsg() to build these calls and executes them
///         through the Chainlink CRE EVMClient capability.
///
///         Attestation format: abi.encode(data) signed by CRE DON key.
///         Verified via ecrecover against the registered CRE_OPERATOR address.
interface ICRECallback {
    /// @notice CRE calls this after a match is accepted to create the loan
    ///         and lock collateral atomically.
    /// @dev This is a convenience function that calls:
    ///      1. CollateralManager.lockCollateral()
    ///      2. GhostLoanLedger.createLoan()
    ///      in a single transaction.
    function onMatchAccepted(
        bytes32 loanId,
        address borrower,
        address loanToken,
        uint256 principal,
        uint256 aggregateRateBps,
        address collateralToken,
        uint256 collateralAmount,
        uint256 maturity,
        bytes calldata attestation
    ) external;

    /// @notice CRE calls this when it detects an undercollateralized loan.
    ///         Atomically marks the loan as defaulted and seizes collateral.
    function onLiquidation(
        bytes32 loanId,
        uint256 collateralPrice,
        bytes calldata priceAttestation
    ) external;

    /// @notice CRE calls this after verifying a repayment was received.
    ///         Records repayment on ledger. If fully repaid, releases collateral.
    function onRepaymentConfirmed(
        bytes32 loanId,
        uint256 amount,
        bool isFullRepayment,
        bytes calldata attestation
    ) external;
}
```

### 5.5 InterestAccrual Library

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title InterestAccrual
/// @notice Pure math library for interest computation.
///         Used on-chain by LoanLedger for health checks,
///         and off-chain by CRE for exact interest calculations.
library InterestAccrual {
    uint256 constant BPS_DENOMINATOR = 10_000;
    uint256 constant SECONDS_PER_YEAR = 365 days;
    uint256 constant PRECISION = 1e18;

    /// @notice Simple interest: principal * rate * time / year
    /// @param principal The loan principal (in token units, 18 decimals)
    /// @param rateBps Annual rate in basis points (e.g. 500 = 5%)
    /// @param elapsed Seconds since loan creation
    /// @return interest The accrued interest amount
    function computeSimpleInterest(
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed
    ) internal pure returns (uint256 interest) {
        interest = (principal * rateBps * elapsed) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    }

    /// @notice Total debt = principal + accrued interest
    function totalDebt(
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed
    ) internal pure returns (uint256) {
        return principal + computeSimpleInterest(principal, rateBps, elapsed);
    }

    /// @notice Health ratio: collateralValue / outstandingDebt
    ///         Returns value scaled to 18 decimals (1e18 = exactly collateralized)
    /// @param collateralAmount Amount of collateral tokens
    /// @param collateralPrice Price of 1 collateral token in loan token units (18 dec)
    /// @param principal Loan principal
    /// @param rateBps Annual rate in bps
    /// @param elapsed Seconds since creation
    /// @param repaidAmount Amount already repaid
    function healthRatio(
        uint256 collateralAmount,
        uint256 collateralPrice,
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed,
        uint256 repaidAmount
    ) internal pure returns (uint256) {
        uint256 debt = totalDebt(principal, rateBps, elapsed);
        if (debt <= repaidAmount) return type(uint256).max; // fully repaid
        uint256 outstanding = debt - repaidAmount;
        uint256 collateralValue = (collateralAmount * collateralPrice) / PRECISION;
        return (collateralValue * PRECISION) / outstanding;
    }
}
```

---

## 6. Privacy-Preserving Design Decisions

### What is hidden vs revealed on-chain

```
ON-CHAIN (public)                         OFF-CHAIN (private)
─────────────────                         ───────────────────
Vault total deposits per token            Individual user balances
Vault total locked per token              Who owns which balance
Loan exists with loanId                   Lender identities
Loan principal amount                     Individual lender rates
Loan collateral amount + token            Discriminatory tick rates
Loan maturity timestamp                   Encrypted rate blobs
Loan status (active/repaid/defaulted)     Match proposals
Loan borrower hash (not address)          Credit scores/tiers
Aggregate blended rate (for health)       Transfer history
Liquidation events                        Who transferred to whom
```

### Borrower identity protection

The on-chain loan stores `borrowerHash = keccak256(abi.encodePacked(borrower))`
rather than the raw address. This means:

- Anyone can verify a loan exists and its terms
- Only the borrower (who knows their address) can prove ownership
- Collateral lock uses the raw address (necessary for fund movement) but
  the CollateralManager access is restricted to CRE_OPERATOR_ROLE
- External observers see collateral locks but cannot link them to specific
  loans without the borrower's cooperation

### Rate privacy

The aggregate rate stored on-chain is the blended rate across all matched ticks.
Individual lender rates remain encrypted in the off-chain server and are only
ever decrypted inside CRE. An observer can see "this loan has a 5.08% blended
rate" but cannot determine that Alice lent at 5% and Dave at 5.5%.

---

## 7. CRE Integration — New vault-sync Workflow

Currently CRE has three workflows: settle-loans, check-loans, execute-transfers.
The custom vault adds a fourth: **vault-sync**, which bridges on-chain state
with off-chain state.

### vault-sync Workflow

```
CronTrigger (every 30s):

  1. Read on-chain loan states via EVMClient
     - GhostLoanLedger.getActiveLoanCount()
     - For each active loan: getLoan(), getLoanHealth()

  2. Compare with off-chain server state
     - GET /internal/check-loans from GHOST server
     - Detect discrepancies (loan exists on-chain but not server, or vice versa)

  3. Sync actions:
     - If loan created off-chain but not on-chain: call onMatchAccepted()
     - If repayment recorded off-chain but not on-chain: call onRepaymentConfirmed()
     - If loan defaulted on-chain but not off-chain: POST /internal/liquidate-loans
```

### Modified settle-loans Workflow

After matching and proposal acceptance, CRE now also writes to chain:

```
Current flow:
  CRE matches → POST /internal/record-match-proposals → done

New flow:
  CRE matches → POST /internal/record-match-proposals
  Borrower accepts (or auto-accept timeout)
  CRE detects acceptance → EVMClient.writeContract():
    GhostRouter.onMatchAccepted(loanId, borrower, ...)
    This atomically:
      1. CollateralManager.lockCollateral()
      2. GhostLoanLedger.createLoan()
  CRE then executes private transfer for principal disbursement (as before)
```

### Modified check-loans Workflow

Liquidation now has on-chain proof:

```
Current flow:
  CRE reads price → compares off-chain → POST /internal/liquidate-loans

New flow:
  CRE reads price from Chainlink feed (via EVMClient, as current)
  CRE reads loan health from GhostLoanLedger.getLoanHealth() on-chain
  If unhealthy:
    CRE calls GhostRouter.onLiquidation(loanId, price, attestation)
    This atomically:
      1. GhostLoanLedger.markDefaulted()
      2. CollateralManager.liquidate()
    CRE then POST /internal/liquidate-loans to update server state
    CRE queues private transfers for lender distribution
```

---

## 8. Attestation System

CRE signs attestations that prove its actions are legitimate. This replaces
the trust assumption "CRE told the server to do X" with a cryptographic
proof "CRE signed X and the contract verified it."

### Attestation Format

```
attestation = abi.encode(
  bytes32 actionHash,     // keccak256 of the action data
  uint256 timestamp,      // block.timestamp when CRE computed this
  uint256 nonce,          // per-loan nonce to prevent replay
  bytes   signature       // ECDSA sig by CRE DON key
)
```

### Verification

```solidity
function _verifyAttestation(
    bytes32 actionHash,
    bytes calldata attestation
) internal view returns (bool) {
    (uint256 timestamp, uint256 nonce, bytes memory sig) =
        abi.decode(attestation, (uint256, uint256, bytes));

    // Check freshness (within 5 minutes)
    require(block.timestamp - timestamp <= 300, "Stale attestation");

    // Check nonce (prevent replay)
    require(!usedNonces[actionHash][nonce], "Nonce reused");

    // Recover signer
    bytes32 digest = keccak256(abi.encodePacked(actionHash, timestamp, nonce));
    address signer = ECDSA.recover(
        MessageHashUtils.toEthSignedMessageHash(digest),
        sig
    );

    // Verify signer has CRE_OPERATOR_ROLE
    return hasRole(CRE_OPERATOR_ROLE, signer);
}
```

---

## 9. Gas Optimization Strategy

### 9.1 Storage Packing

```solidity
// LoanRecord packs into 4 storage slots instead of 10
struct LoanRecord {
    // Slot 1: borrowerHash (32 bytes)
    bytes32 borrowerHash;

    // Slot 2: addresses packed
    address loanToken;          // 20 bytes
    uint48  createdAt;          // 6 bytes — unix timestamp (good until year 10889)
    uint48  maturity;           // 6 bytes

    // Slot 3: principal + rate + status
    uint128 principal;          // 16 bytes — max ~3.4e38, sufficient for any token
    uint128 collateralAmount;   // 16 bytes

    // Slot 4: collateral token + rate + repaid
    address collateralToken;    // 20 bytes
    uint16  aggregateRateBps;   // 2 bytes — max 655.35%, sufficient
    uint8   status;             // 1 byte
    // 9 bytes free

    // Slot 5: repaid (needs full uint256 for precision)
    uint256 repaidAmount;
}
// 5 slots vs 10 naive = 50% storage cost reduction
```

### 9.2 Batch Operations

```solidity
/// @notice Create multiple loans in a single transaction (epoch batch)
function createLoanBatch(
    bytes32[] calldata loanIds,
    bytes32[] calldata borrowerHashes,
    address[] calldata loanTokens,
    uint256[] calldata principals,
    uint256[] calldata aggregateRatesBps,
    address[] calldata collateralTokens,
    uint256[] calldata collateralAmounts,
    uint256[] calldata maturities,
    bytes calldata batchAttestation     // single attestation for entire batch
) external;
// Saves ~21,000 gas per loan (base tx cost) when batching epoch results
```

### 9.3 Minimal On-Chain Data

The primary gas optimization is architectural: store the minimum on-chain.

| Data                    | On-chain cost if stored | Our approach         |
| ----------------------- | ----------------------- | -------------------- |
| Individual lender rates | ~20,000 gas per tick    | Off-chain only       |
| Lender addresses        | ~20,000 gas per lender  | Off-chain only       |
| Match proposals         | ~50,000 gas per         | Off-chain only       |
| Credit scores           | ~20,000 gas per update  | Off-chain only       |
| Transfer history        | ~40,000 gas per         | Off-chain only       |
| Loan aggregate record   | ~100,000 gas per loan   | On-chain (necessary) |
| Collateral lock         | ~60,000 gas per lock    | On-chain (necessary) |

Estimated gas per loan lifecycle:

- Lock collateral: ~60,000
- Create loan: ~100,000
- Record repayment: ~30,000
- Release collateral: ~40,000
- **Total: ~230,000 gas** (~$0.50 at 30 gwei, 2000 ETH/USD)

Compare to fully on-chain lending (Aave/Compound): ~500,000-800,000 gas per borrow.

### 9.4 Events Over Storage

For data that only needs to be indexed (not read on-chain), use events:

```solidity
// Instead of storing transfer history:
event PrivateTransferExecuted(
    bytes32 indexed transferId,
    bytes32 indexed recipientHash,  // keccak256(recipient) for privacy
    address indexed token,
    uint256 amount,
    string  reason
);
// Cost: ~1,500 gas per log topic vs ~20,000 per storage slot
```

---

## 10. Upgrade Path: Current Vault to Custom Vault

### Phase 1: Deploy Custom Contracts (No Migration)

Deploy all contracts behind UUPS proxies. Run in parallel with existing vault.
No user action required.

```
Week 1-2:
  - Deploy GhostVault (proxy)
  - Deploy CollateralManager (proxy)
  - Deploy GhostLoanLedger (proxy)
  - Deploy GhostPolicyEngine
  - Deploy GhostRouter (orchestrator)
  - Register gUSD and gETH tokens
  - Grant CRE_OPERATOR_ROLE to CRE DON address
  - Test with small deposits
```

### Phase 2: Dual-Write Mode

CRE writes to both old system (off-chain only) and new system (on-chain + off-chain).
Users still interact with old vault.

```
Week 3-4:
  - Update CRE workflows to dual-write:
    - settle-loans: after match acceptance, also call onMatchAccepted() on-chain
    - check-loans: read health from both off-chain and on-chain, compare
    - execute-transfers: continue using old vault private transfers
  - Verify on-chain state matches off-chain state for all operations
  - Monitor gas costs
```

### Phase 3: New Deposits to Custom Vault

New deposits go to custom vault. Existing deposits remain in old vault
until loans mature.

```
Week 5-6:
  - Update client deposit flow:
    - deposit() calls GhostVault.deposit() instead of old vault
    - withdraw flow uses new ticket system
  - Old vault deposits: let existing loans run to maturity
  - New vault handles all new lending activity
  - CRE reads from both vaults during transition
```

### Phase 4: Full Migration

After all old loans mature (max 30 days by default), migrate remaining
balances.

```
Week 7-10:
  - Users with remaining old vault balances:
    - Withdraw from old vault (withdrawWithTicket)
    - Deposit into new vault (deposit)
    - Or: GHOST provides a migration contract that does this atomically
  - Decommission old vault integration
  - Remove dual-write from CRE
```

### Migration Contract

```solidity
/// @title GhostMigration
/// @notice One-click migration from old Chainlink vault to new GhostVault.
///         User calls migrate() with their old vault withdrawal ticket.
///         Contract withdraws from old, deposits into new, atomically.
contract GhostMigration {
    address public immutable oldVault;
    address public immutable newVault;

    function migrate(
        address token,
        uint256 amount,
        bytes calldata oldTicket
    ) external {
        // 1. Withdraw from old vault using ticket
        IOldVault(oldVault).withdrawWithTicket(token, amount, oldTicket);

        // 2. Approve new vault
        IERC20(token).approve(newVault, amount);

        // 3. Deposit into new vault (on behalf of msg.sender)
        IGhostVault(newVault).deposit(token, amount);
    }
}
```

---

## 11. Emergency Mechanisms

### Pause Granularity

```solidity
// GhostVault supports granular pausing:
enum PauseScope {
    ALL,                // Everything paused
    DEPOSITS_ONLY,      // No new deposits, withdrawals OK
    WITHDRAWALS_ONLY,   // No withdrawals, deposits OK
    LENDING_ONLY        // No new collateral locks, existing loans continue
}

function pauseScope(PauseScope scope) external onlyRole(PAUSER_ROLE);
```

### Circuit Breaker

```solidity
// Auto-pause if too many liquidations in a short window
// (indicates oracle manipulation or market crash)
uint256 public liquidationCount;
uint256 public liquidationWindowStart;
uint256 public constant MAX_LIQUIDATIONS_PER_HOUR = 10;

modifier circuitBreaker() {
    if (block.timestamp - liquidationWindowStart > 1 hours) {
        liquidationCount = 0;
        liquidationWindowStart = block.timestamp;
    }
    require(liquidationCount < MAX_LIQUIDATIONS_PER_HOUR, "Circuit breaker");
    liquidationCount++;
    _;
}
```

### Timelock on Upgrades

```solidity
// All proxy upgrades go through a 48-hour timelock
// controlled by a multi-sig (Gnosis Safe)
// This gives users time to exit if they disagree with an upgrade

// Implementation:
// GhostVault proxy admin = TimelockController (48h delay)
// TimelockController owner = GnosisSafe (3/5 multisig)
```

---

## 12. Contract Dependency Graph

```
                    ┌──────────────────┐
                    │  TimelockController│
                    │  (48h delay)      │
                    └────────┬─────────┘
                             │ owns (proxy admin)
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌─────▼─────┐       ┌────▼──────┐
    │GhostVault│        │Collateral │       │GhostLoan  │
    │  (UUPS) │◄───────│Manager    │──────►│Ledger     │
    │         │ locks/  │  (UUPS)  │creates│  (UUPS)   │
    │         │releases │          │       │           │
    └────┬────┘        └─────┬─────┘       └─────┬─────┘
         │                   │                   │
         │              ┌────▼────┐              │
         │              │GhostRouter│◄────────────┘
         │              │(orchestrator)│
         │              │           │
         │              └─────┬─────┘
         │                    │
         │                    │ called by CRE via EVMClient
         │                    │
    ┌────▼──────────┐   ┌─────▼──────────┐
    │GhostPolicy    │   │  CRE DON       │
    │Engine         │   │  (off-chain)    │
    │               │   │                 │
    │extends ACE    │   │ settle-loans    │
    │PolicyEngine   │   │ check-loans     │
    └───────────────┘   │ execute-xfers   │
                        │ vault-sync      │
                        └─────────────────┘

Dependencies:
  GhostVault         → reads PolicyEngine on deposit/withdraw
  CollateralManager  → calls GhostVault.lockBalance / releaseBalance
  CollateralManager  → reads GhostLoanLedger for loan status
  GhostLoanLedger    → calls CollateralManager on repayment (release)
  GhostRouter        → orchestrates CollateralManager + LoanLedger
  CRE                → calls GhostRouter via EVMClient
  CRE                → calls GHOST Server via ConfidentialHTTPClient
```

---

## 13. What is Novel vs What Exists

### Already exists (Chainlink provides)

- ERC20 vault deposit/withdraw pattern
- PolicyEngine compliance framework (ACE)
- Withdrawal ticket mechanism (signed off-chain, redeemed on-chain)
- CRE runtime with ConfidentialHTTPClient and EVMClient
- Chainlink price feeds for collateral valuation
- EIP-712 typed-data signature verification

### Novel to GHOST custom vault

1. **Collateral earmarking in the vault itself** — the vault tracks
   `totalLocked` per token so withdrawals are blocked for collateralized
   amounts. This does not exist in the generic Compliant Private Transfer vault.

2. **CRE-attested on-chain loan records** — loans are anchored on-chain
   with CRE attestations rather than existing purely in off-chain server state.
   This makes loans verifiable without trusting the GHOST server.

3. **Privacy-preserving loan ledger** — stores `borrowerHash` instead of
   raw addresses, and stores only the blended rate (not individual tick rates).
   This is a novel balance between verifiability and privacy.

4. **Hybrid liquidation with circuit breaker** — liquidation is triggered
   by CRE (which reads Chainlink feeds) but executed on-chain atomically
   with a circuit breaker that auto-pauses on anomalous liquidation rates.

5. **Dual-phase collateral management** — collateral is locked with a
   CRE attestation at loan creation but can be partially released (excess)
   by the borrower with a fresh price attestation. This matches the current
   `claimExcessCollateral` feature but with on-chain guarantees.

6. **Batch loan creation** — epoch-based matching produces multiple loans
   at once. The `createLoanBatch()` function handles this in a single
   transaction with one attestation, saving significant gas.

7. **GhostRouter orchestrator** — a single entry point for CRE that
   coordinates multi-contract actions atomically (lock + create, or
   default + seize). Prevents partial state from CRE transaction failures.

---

## 14. Security Considerations

### Access Control Matrix

```
Function                    │ Who can call            │ Verification
────────────────────────────┼─────────────────────────┼──────────────────
GhostVault.deposit()        │ Anyone                  │ PolicyEngine check
GhostVault.withdrawTicket() │ Ticket holder           │ Signature + policy
GhostVault.lockBalance()    │ CollateralManager only  │ COLLATERAL_ROLE
GhostVault.releaseBalance() │ CollateralManager only  │ COLLATERAL_ROLE
GhostVault.pause()          │ PAUSER_ROLE             │ AccessControl
CollMgr.lockCollateral()    │ GhostRouter only        │ CRE attestation
CollMgr.releaseCollateral() │ GhostRouter only        │ CRE attestation
CollMgr.liquidate()         │ GhostRouter only        │ CRE attestation + CB
LoanLedger.createLoan()     │ GhostRouter only        │ CRE attestation
LoanLedger.markDefaulted()  │ GhostRouter only        │ CRE attestation
GhostRouter.onMatch*()      │ CRE_OPERATOR_ROLE       │ Role + attestation
GhostRouter.onLiquidation() │ CRE_OPERATOR_ROLE       │ Role + attestation + CB
```

### Reentrancy Protection

All state-changing functions in GhostVault, CollateralManager, and
GhostLoanLedger use OpenZeppelin's ReentrancyGuardUpgradeable.
The GhostRouter uses checks-effects-interactions pattern with
cross-contract calls at the end.

### Oracle Manipulation Resistance

- CRE reads prices from Chainlink feeds (trusted oracle infrastructure)
- Price attestations are signed by CRE and verified on-chain
- Circuit breaker limits liquidation rate (max 10/hour)
- Minimum time between price-dependent operations (no same-block liquidation)

### Flash Loan Attack Surface

- Deposits require PolicyEngine approval (not instant)
- Collateral locks require CRE attestation (cannot be done in same block)
- Liquidation requires CRE attestation + circuit breaker
- No on-chain AMM or price-dependent swap functions

---

## 15. Deployment Addresses (Planned — Sepolia)

```
GhostVault (proxy):          TBD
GhostVault (impl):           TBD
CollateralManager (proxy):   TBD
CollateralManager (impl):    TBD
GhostLoanLedger (proxy):     TBD
GhostLoanLedger (impl):      TBD
GhostRouter:                 TBD
GhostPolicyEngine (proxy):   TBD
InterestAccrual (library):   TBD
TimelockController:          TBD
GnosisSafe (multisig):       TBD

Existing (unchanged):
gUSD token:                  (config.TOKEN_ADDRESS)
gETH token:                  0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6
Old Chainlink vault:         0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13
ETH/USD Chainlink feed:      0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612 (Arbitrum)
```
