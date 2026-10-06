// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title InterestAccrual
/// @notice Pure math library for interest computation in GHOST Protocol.
///         Used on-chain by GhostLoanLedger for health ratio calculations,
///         and referenced by CRE for exact interest amounts.
///
///         All functions are `internal pure` — no state, no external calls.
///         Deploy cost is zero (library is inlined by the compiler).
///
///         Rate convention: basis points (bps), where 1 bps = 0.01%.
///         Example: 500 bps = 5.00%, 508 bps = 5.08%
///
///         Amount convention: 18 decimal fixed-point (same as ERC20).
///         Example: 1e18 = 1.0 token
library InterestAccrual {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant SECONDS_PER_YEAR = 365 days; // 31,536,000
    uint256 internal constant PRECISION = 1e18;

    /// @notice Compute simple interest: principal * rate * time / year.
    ///         Simple interest (not compound) matches GHOST's loan model
    ///         where interest is computed once at repayment, not continuously.
    ///
    /// @param principal The loan principal (18 decimals)
    /// @param rateBps Annual rate in basis points (e.g., 500 = 5%)
    /// @param elapsed Seconds since loan creation
    /// @return interest The accrued interest amount (18 decimals)
    function computeSimpleInterest(
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed
    ) internal pure returns (uint256 interest) {
        // principal * rateBps * elapsed / (BPS_DENOMINATOR * SECONDS_PER_YEAR)
        // Overflow-safe for principal up to ~1.15e59 at 65535 bps over 100 years
        interest = (principal * rateBps * elapsed) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    }

    /// @notice Total debt = principal + accrued simple interest.
    /// @param principal The loan principal (18 decimals)
    /// @param rateBps Annual rate in bps
    /// @param elapsed Seconds since loan creation
    /// @return debt Total owed amount (18 decimals)
    function totalDebt(
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed
    ) internal pure returns (uint256 debt) {
        debt = principal + computeSimpleInterest(principal, rateBps, elapsed);
    }

    /// @notice Compute outstanding debt after partial repayments.
    /// @param principal The loan principal (18 decimals)
    /// @param rateBps Annual rate in bps
    /// @param elapsed Seconds since loan creation
    /// @param repaidAmount Total amount already repaid
    /// @return outstanding Remaining debt (0 if fully repaid)
    function outstandingDebt(
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed,
        uint256 repaidAmount
    ) internal pure returns (uint256 outstanding) {
        uint256 total = totalDebt(principal, rateBps, elapsed);
        if (total <= repaidAmount) return 0;
        outstanding = total - repaidAmount;
    }

    /// @notice Compute health ratio: collateralValue / outstandingDebt.
    ///         Returns value scaled to 18 decimals:
    ///           1.0e18 = exactly collateralized (100%)
    ///           1.5e18 = 150% collateralized
    ///           2.0e18 = 200% collateralized
    ///           type(uint256).max = fully repaid (infinite health)
    ///
    ///         Used by GhostLoanLedger.getLoanHealth() and by CRE's
    ///         check-loans workflow to determine liquidation eligibility.
    ///
    /// @param collateralAmount Amount of collateral tokens (18 decimals)
    /// @param collateralPrice Price of 1 collateral token in loan token units (18 decimals).
    ///                        For same-token: 1e18.
    ///                        For gETH collateral / gUSD loan: ETH price * 1e18.
    /// @param principal Loan principal (18 decimals)
    /// @param rateBps Annual rate in bps
    /// @param elapsed Seconds since creation
    /// @param repaidAmount Amount already repaid (18 decimals)
    /// @return ratio Health ratio scaled to 18 decimals
    function healthRatio(
        uint256 collateralAmount,
        uint256 collateralPrice,
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed,
        uint256 repaidAmount
    ) internal pure returns (uint256 ratio) {
        uint256 outstanding = outstandingDebt(principal, rateBps, elapsed, repaidAmount);

        // Fully repaid: infinite health
        if (outstanding == 0) return type(uint256).max;

        // collateralValue = collateralAmount * collateralPrice / PRECISION
        uint256 collateralValue = (collateralAmount * collateralPrice) / PRECISION;

        // healthRatio = collateralValue * PRECISION / outstanding
        ratio = (collateralValue * PRECISION) / outstanding;
    }

    /// @notice Check if a loan is undercollateralized given a threshold.
    ///         Convenience function combining healthRatio check.
    ///
    /// @param collateralAmount Amount of collateral tokens (18 decimals)
    /// @param collateralPrice Price of 1 collateral token in loan token units (18 decimals)
    /// @param principal Loan principal (18 decimals)
    /// @param rateBps Annual rate in bps
    /// @param elapsed Seconds since creation
    /// @param repaidAmount Amount already repaid
    /// @param thresholdRatio Minimum health ratio (18 decimals), e.g., 1.2e18 for 120%
    /// @return isUnhealthy True if health ratio is below threshold
    function isUndercollateralized(
        uint256 collateralAmount,
        uint256 collateralPrice,
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed,
        uint256 repaidAmount,
        uint256 thresholdRatio
    ) internal pure returns (bool isUnhealthy) {
        uint256 ratio = healthRatio(
            collateralAmount,
            collateralPrice,
            principal,
            rateBps,
            elapsed,
            repaidAmount
        );
        isUnhealthy = ratio < thresholdRatio;
    }
}
