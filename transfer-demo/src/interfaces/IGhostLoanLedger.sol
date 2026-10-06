// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IGhostLoanLedger
/// @notice On-chain loan record keeper for GHOST Protocol.
///         Stores MINIMAL loan data — enough for:
///         1. Collateral health verification (anyone can check)
///         2. CRE-triggered liquidation with on-chain proof
///         3. Borrower loan term verification
///
///         Privacy: does NOT store lender identities or individual tick rates.
///         Only the blended aggregate rate is stored (for health calculations).
///         Borrower address is stored as keccak256(borrower) not raw address.
///
///         Lender distribution after repayment/liquidation is handled entirely
///         off-chain via the private transfer layer, using discriminatory rates
///         that only CRE knows.
interface IGhostLoanLedger {
    // ── Enums ───────────────────────────────────────────────────────────

    enum LoanStatus {
        Active,
        Repaid,
        Defaulted
    }

    // ── Structs ─────────────────────────────────────────────────────────

    /// @notice Packed loan record. Fits in 5 storage slots.
    /// @dev Storage layout:
    ///      Slot 1: borrowerHash (bytes32)
    ///      Slot 2: loanToken (address, 20B) + createdAt (uint48, 6B) + maturity (uint48, 6B)
    ///      Slot 3: principal (uint128, 16B) + collateralAmount (uint128, 16B)
    ///      Slot 4: collateralToken (address, 20B) + aggregateRateBps (uint16, 2B) + status (uint8, 1B)
    ///      Slot 5: repaidAmount (uint256, 32B)
    struct LoanRecord {
        bytes32 borrowerHash;
        address loanToken;
        uint48  createdAt;
        uint48  maturity;
        uint128 principal;
        uint128 collateralAmount;
        address collateralToken;
        uint16  aggregateRateBps;
        LoanStatus status;
        uint256 repaidAmount;
    }

    // ── Events ──────────────────────────────────────────────────────────

    event LoanCreated(
        bytes32 indexed loanId,
        bytes32 indexed borrowerHash,
        address indexed loanToken,
        uint256 principal,
        uint256 maturity
    );

    event RepaymentRecorded(
        bytes32 indexed loanId,
        uint256 amount,
        uint256 totalRepaid
    );

    event LoanRepaid(bytes32 indexed loanId, uint256 totalRepaid);

    event LoanDefaulted(bytes32 indexed loanId);

    // ── Errors ──────────────────────────────────────────────────────────

    error LoanAlreadyExists(bytes32 loanId);
    error LoanNotFound(bytes32 loanId);
    error LoanNotActive(bytes32 loanId);
    error InvalidAttestation();
    error RepaymentExceedsOwed(uint256 repaid, uint256 owed);

    // ── Loan creation ───────────────────────────────────────────────────

    /// @notice Record a new loan on-chain after match acceptance.
    ///         Called by GhostRouter with CRE attestation.
    ///
    ///         The borrowerHash is keccak256(abi.encodePacked(borrower))
    ///         to preserve privacy — external observers cannot determine
    ///         the borrower address from the hash alone.
    ///
    ///         The aggregateRateBps is the blended rate across all matched
    ///         lender ticks (e.g., 508 = 5.08%). This is used ONLY for
    ///         health ratio calculations, not for actual interest distribution
    ///         (which uses discriminatory rates off-chain).
    ///
    /// @param loanId Unique identifier (deterministic from CRE)
    /// @param borrowerHash keccak256(abi.encodePacked(borrower))
    /// @param loanToken The borrowed token address
    /// @param principal The principal amount
    /// @param aggregateRateBps Blended annual rate in basis points
    /// @param collateralToken The collateral token address
    /// @param collateralAmount The locked collateral amount
    /// @param maturity Unix timestamp when loan matures
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

    /// @notice Create multiple loans in a single transaction.
    ///         Gas optimization for epoch batches — saves ~21,000 gas per loan
    ///         (base transaction cost amortized across the batch).
    ///         Single CRE attestation covers the entire batch.
    ///
    /// @param loanIds Array of unique identifiers
    /// @param borrowerHashes Array of keccak256(borrower)
    /// @param loanTokens Array of borrowed token addresses
    /// @param principals Array of principal amounts
    /// @param aggregateRatesBps Array of blended rates in bps
    /// @param collateralTokens Array of collateral token addresses
    /// @param collateralAmounts Array of collateral amounts
    /// @param maturities Array of maturity timestamps
    /// @param batchAttestation Single CRE attestation for entire batch
    function createLoanBatch(
        bytes32[] calldata loanIds,
        bytes32[] calldata borrowerHashes,
        address[] calldata loanTokens,
        uint256[] calldata principals,
        uint256[] calldata aggregateRatesBps,
        address[] calldata collateralTokens,
        uint256[] calldata collateralAmounts,
        uint256[] calldata maturities,
        bytes calldata batchAttestation
    ) external;

    // ── Repayment recording ─────────────────────────────────────────────

    /// @notice Record a partial or full repayment on-chain.
    ///         This does NOT distribute funds to lenders — that happens
    ///         entirely off-chain via private transfers using discriminatory
    ///         rates. This function only updates the aggregate repaid amount
    ///         for health ratio tracking.
    ///
    ///         If repaidAmount reaches totalDebt (principal + interest),
    ///         the loan status changes to Repaid and CollateralManager
    ///         releases the collateral.
    ///
    /// @param loanId The loan ID
    /// @param amount The repayment amount
    /// @param attestation CRE-signed proof or REPAYMENT_ROLE signature
    function recordRepayment(
        bytes32 loanId,
        uint256 amount,
        bytes calldata attestation
    ) external;

    // ── Default marking ─────────────────────────────────────────────────

    /// @notice Mark a loan as defaulted due to undercollateralization or maturity.
    ///         Called by GhostRouter (CRE_OPERATOR_ROLE).
    ///         Emits LoanDefaulted event. Does NOT seize collateral directly —
    ///         that is handled by CollateralManager.liquidate() which the
    ///         GhostRouter calls in the same transaction.
    ///
    /// @param loanId The loan to mark as defaulted
    function markDefaulted(bytes32 loanId) external;

    // ── Views ───────────────────────────────────────────────────────────

    /// @notice Get full loan record.
    function getLoan(bytes32 loanId)
        external
        view
        returns (LoanRecord memory);

    /// @notice Compute current health ratio for a loan.
    ///         healthRatio = collateralValue / outstandingDebt
    ///         where outstandingDebt = principal + accruedInterest - repaidAmount
    ///
    ///         Returns value scaled to 18 decimals:
    ///           1.0e18 = exactly collateralized
    ///           1.5e18 = 150% collateralized
    ///           type(uint256).max = fully repaid
    ///
    /// @param loanId The loan ID
    /// @param collateralPrice Price of 1 collateral token in loan token units (18 decimals).
    ///                        For same-token collateral (gUSD/gUSD), pass 1e18.
    ///                        For cross-token (gETH collateral, gUSD loan), pass ETH price in USD.
    /// @return healthRatio Scaled to 18 decimals
    function getLoanHealth(
        bytes32 loanId,
        uint256 collateralPrice
    ) external view returns (uint256 healthRatio);

    /// @notice Count of currently active loans (for CRE polling).
    function getActiveLoanCount() external view returns (uint256);

    /// @notice Check if a loan has passed its maturity timestamp.
    function isMatured(bytes32 loanId) external view returns (bool);

    /// @notice Compute total debt (principal + interest) at current block.
    function totalDebt(bytes32 loanId) external view returns (uint256);
}
