// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICRECallback
/// @notice Orchestrator interface for Chainlink CRE to interact with GHOST contracts.
///         Implemented by GhostRouter, which coordinates multi-contract actions
///         atomically to prevent partial state from failed transactions.
///
///         CRE interacts with this contract via the EVMClient capability:
///           const evmClient = new cre.capabilities.EVMClient(chainSelector);
///           evmClient.writeContract(runtime, {
///             call: encodeCallMsg({
///               from: creOperatorAddress,
///               to: ghostRouterAddress,
///               data: encodeFunctionData({ abi, functionName, args })
///             }),
///           });
///
///         All functions require:
///         1. Caller has CRE_OPERATOR_ROLE
///         2. Valid CRE attestation (signed by CRE DON key)
///
///         Attestation format:
///           attestation = abi.encode(
///             uint256 timestamp,      // block.timestamp when CRE computed this
///             uint256 nonce,          // per-action nonce for replay protection
///             bytes   signature       // ECDSA sig by CRE DON key
///           )
///
///         The actionHash is computed deterministically from the function parameters:
///           actionHash = keccak256(abi.encodePacked(param1, param2, ...))
///         and verified against the attestation signature.
interface ICRECallback {
    // ── Events ──────────────────────────────────────────────────────────

    event MatchAccepted(
        bytes32 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint256 collateralAmount
    );

    event LiquidationExecuted(
        bytes32 indexed loanId,
        uint256 collateralSeized,
        uint256 collateralPrice
    );

    event RepaymentConfirmed(
        bytes32 indexed loanId,
        uint256 amount,
        bool isFullRepayment
    );

    event BatchMatchAccepted(
        uint256 loanCount,
        uint256 totalPrincipal,
        uint256 totalCollateral
    );

    // ── Errors ──────────────────────────────────────────────────────────

    error NotCREOperator(address caller);
    error InvalidAttestation();
    error LoanAlreadyProcessed(bytes32 loanId);
    error BatchLengthMismatch();

    // ── Match acceptance (single) ───────────────────────────────────────

    /// @notice Called by CRE after a borrower accepts a match proposal
    ///         (or after auto-accept on timeout).
    ///
    ///         Atomically:
    ///         1. CollateralManager.lockCollateral() — earmarks vault funds
    ///         2. GhostLoanLedger.createLoan() — records loan on-chain
    ///
    ///         After this transaction succeeds, CRE executes the principal
    ///         disbursement via off-chain private transfer (unchanged from
    ///         current system).
    ///
    /// @param loanId Deterministic loan ID from CRE matching
    /// @param borrower The borrower's address (stored as hash in ledger)
    /// @param loanToken The borrowed token address (gUSD)
    /// @param principal The principal amount (18 decimals)
    /// @param aggregateRateBps Blended rate in basis points (for health checks)
    /// @param collateralToken The collateral token address (gUSD or gETH)
    /// @param collateralAmount The amount to lock as collateral
    /// @param maturity Unix timestamp when loan matures
    /// @param attestation CRE-signed attestation proving authorization
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

    // ── Match acceptance (batch) ────────────────────────────────────────

    /// @notice Batch version of onMatchAccepted for epoch results.
    ///         Creates multiple loans in a single transaction.
    ///         Saves ~21,000 gas per loan (base tx cost amortization).
    ///
    /// @param loanIds Array of loan IDs
    /// @param borrowers Array of borrower addresses
    /// @param loanTokens Array of borrowed token addresses
    /// @param principals Array of principal amounts
    /// @param aggregateRatesBps Array of blended rates
    /// @param collateralTokens Array of collateral token addresses
    /// @param collateralAmounts Array of collateral amounts
    /// @param maturities Array of maturity timestamps
    /// @param batchAttestation Single CRE attestation for entire batch
    function onMatchAcceptedBatch(
        bytes32[] calldata loanIds,
        address[] calldata borrowers,
        address[] calldata loanTokens,
        uint256[] calldata principals,
        uint256[] calldata aggregateRatesBps,
        address[] calldata collateralTokens,
        uint256[] calldata collateralAmounts,
        uint256[] calldata maturities,
        bytes calldata batchAttestation
    ) external;

    // ── Liquidation ─────────────────────────────────────────────────────

    /// @notice Called by CRE when it detects an undercollateralized or matured loan.
    ///
    ///         Atomically:
    ///         1. GhostLoanLedger.markDefaulted() — updates loan status
    ///         2. CollateralManager.liquidate() — seizes collateral
    ///             - 5% protocol fee (stays in vault)
    ///             - 95% released for lender distribution (off-chain)
    ///
    ///         After this transaction, CRE:
    ///         - Updates GHOST server state (POST /internal/liquidate-loans)
    ///         - Queues private transfers for lender distribution
    ///
    /// @param loanId The loan to liquidate
    /// @param collateralPrice Current price of collateral in loan token units (18 dec)
    /// @param priceAttestation CRE-signed price proof (includes Chainlink feed data)
    function onLiquidation(
        bytes32 loanId,
        uint256 collateralPrice,
        bytes calldata priceAttestation
    ) external;

    // ── Repayment confirmation ──────────────────────────────────────────

    /// @notice Called by CRE after verifying a repayment was received.
    ///
    ///         Effects:
    ///         1. GhostLoanLedger.recordRepayment() — updates repaid amount
    ///         2. If full repayment:
    ///            - CollateralManager.releaseCollateral() — unlocks funds
    ///            - Loan status changes to Repaid
    ///
    ///         CRE verifies repayment by checking private transfer records
    ///         on the off-chain API before calling this function.
    ///
    /// @param loanId The loan ID
    /// @param amount The repayment amount
    /// @param isFullRepayment Whether this completes the loan
    /// @param attestation CRE-signed proof
    function onRepaymentConfirmed(
        bytes32 loanId,
        uint256 amount,
        bool isFullRepayment,
        bytes calldata attestation
    ) external;
}
