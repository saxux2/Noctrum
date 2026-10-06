// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICollateralManager
/// @notice Manages collateral lifecycle for GHOST Protocol loans.
///         Collateral is held inside the GhostVault but earmarked (locked)
///         so the borrower cannot withdraw it during the loan.
///
///         State transitions:
///           lockCollateral()    → CollateralLock created with status Locked
///           releaseCollateral() → status changes to Released, vault unlocks funds
///           liquidate()         → status changes to Liquidated, funds redistributed
///
///         All mutating functions require CRE attestations (signed by the
///         Chainlink CRE DON key) to prevent unauthorized state changes.
interface ICollateralManager {
    // ── Enums ───────────────────────────────────────────────────────────

    enum LockStatus {
        Locked,
        Released,
        Liquidated
    }

    // ── Structs ─────────────────────────────────────────────────────────

    struct CollateralLock {
        address borrower;
        address token;
        uint128 amount;         // Packed: max ~3.4e38, sufficient for 18-decimal tokens
        uint48  lockedAt;       // Packed: unix timestamp
        LockStatus status;
    }

    // ── Events ──────────────────────────────────────────────────────────

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

    // ── Errors ──────────────────────────────────────────────────────────

    error LoanAlreadyExists(bytes32 loanId);
    error LoanNotFound(bytes32 loanId);
    error CollateralNotLocked(bytes32 loanId);
    error NotBorrower(address caller, address borrower);
    error InvalidAttestation();
    error StaleAttestation(uint256 attestationTime, uint256 currentTime);
    error NonceAlreadyUsed(bytes32 actionHash, uint256 nonce);
    error InsufficientCollateral(uint256 required, uint256 provided);
    error HealthRatioTooLow(uint256 resultingRatio, uint256 minimumRatio);
    error CircuitBreakerTripped(uint256 liquidationCount, uint256 maxPerHour);

    // ── Lock collateral ─────────────────────────────────────────────────

    /// @notice Lock collateral for a new loan.
    ///         Called by GhostRouter after CRE confirms a match acceptance.
    ///
    ///         Attestation proves CRE authorized this lock:
    ///           actionHash = keccak256(abi.encodePacked(loanId, borrower, token, amount))
    ///           attestation = abi.encode(timestamp, nonce, signature)
    ///
    ///         Effects:
    ///         1. Creates CollateralLock record
    ///         2. Calls GhostVault.lockBalance(token, amount)
    ///         3. Emits CollateralLocked event
    ///
    /// @param loanId Unique loan identifier (deterministic from CRE matching)
    /// @param borrower The borrower's address
    /// @param token The collateral token (gUSD or gETH)
    /// @param amount The amount to lock
    /// @param attestation CRE-signed attestation
    function lockCollateral(
        bytes32 loanId,
        address borrower,
        address token,
        uint256 amount,
        bytes calldata attestation
    ) external;

    // ── Release collateral ──────────────────────────────────────────────

    /// @notice Release collateral back to borrower after full repayment.
    ///         Called by GhostRouter when CRE confirms full repayment.
    ///
    ///         Effects:
    ///         1. Updates CollateralLock status to Released
    ///         2. Calls GhostVault.releaseBalance(token, amount)
    ///         3. Emits CollateralReleased event
    ///
    ///         After release, the off-chain private transfer layer
    ///         credits the borrower's shielded balance. The vault
    ///         just un-earmarks the funds so they become withdrawable.
    ///
    /// @param loanId The loan whose collateral to release
    function releaseCollateral(bytes32 loanId) external;

    // ── Claim excess collateral ─────────────────────────────────────────

    /// @notice Allow borrower to claim collateral above the required ratio.
    ///         Borrower may have deposited more collateral than needed (e.g.,
    ///         bronze tier requires 2x but borrower deposited 2.5x).
    ///
    ///         Requires a fresh CRE price attestation to verify the health
    ///         ratio remains above the minimum after the partial release.
    ///
    /// @param loanId The loan ID
    /// @param amount The excess amount to release
    /// @param priceAttestation CRE-signed current collateral price
    function claimExcessCollateral(
        bytes32 loanId,
        uint256 amount,
        bytes calldata priceAttestation
    ) external;

    // ── Liquidation ─────────────────────────────────────────────────────

    /// @notice Seize collateral for an undercollateralized or matured loan.
    ///         Called by GhostRouter when CRE detects an unhealthy loan.
    ///
    ///         Distribution:
    ///         - 5% protocol fee (remains in vault, pool wallet controls)
    ///         - 95% released for lender distribution (via off-chain private transfers)
    ///
    ///         Safety:
    ///         - Circuit breaker: max 10 liquidations per hour
    ///         - Price attestation required to prove undercollateralization
    ///         - Auto-pauses if circuit breaker trips
    ///
    /// @param loanId The loan to liquidate
    /// @param priceAttestation CRE-signed price proof
    function liquidate(
        bytes32 loanId,
        bytes calldata priceAttestation
    ) external;

    // ── Views ───────────────────────────────────────────────────────────

    /// @notice Get collateral lock details for a loan.
    function getCollateralLock(bytes32 loanId)
        external
        view
        returns (
            address borrower,
            address token,
            uint256 amount,
            uint256 lockedAt,
            LockStatus status
        );

    /// @notice Total collateral locked by a borrower for a specific token.
    function totalLockedByBorrower(
        address borrower,
        address token
    ) external view returns (uint256);

    /// @notice Number of liquidations in the current hour window.
    function currentHourLiquidations() external view returns (uint256);

    /// @notice Maximum liquidations allowed per hour before circuit breaker.
    function maxLiquidationsPerHour() external view returns (uint256);
}
