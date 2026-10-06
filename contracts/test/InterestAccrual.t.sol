// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {InterestAccrual} from "../src/libraries/InterestAccrual.sol";

/// @dev Exposes the internal library functions so the tests can call them.
contract InterestAccrualHarness {
    function computeSimpleInterest(uint256 principal, uint256 rateBps, uint256 elapsed)
        external
        pure
        returns (uint256)
    {
        return InterestAccrual.computeSimpleInterest(principal, rateBps, elapsed);
    }

    function totalDebt(uint256 principal, uint256 rateBps, uint256 elapsed) external pure returns (uint256) {
        return InterestAccrual.totalDebt(principal, rateBps, elapsed);
    }

    function outstandingDebt(uint256 principal, uint256 rateBps, uint256 elapsed, uint256 repaid)
        external
        pure
        returns (uint256)
    {
        return InterestAccrual.outstandingDebt(principal, rateBps, elapsed, repaid);
    }

    function healthRatio(
        uint256 collateralAmount,
        uint256 collateralPrice,
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed,
        uint256 repaid
    ) external pure returns (uint256) {
        return InterestAccrual.healthRatio(collateralAmount, collateralPrice, principal, rateBps, elapsed, repaid);
    }

    function isUndercollateralized(
        uint256 collateralAmount,
        uint256 collateralPrice,
        uint256 principal,
        uint256 rateBps,
        uint256 elapsed,
        uint256 repaid,
        uint256 threshold
    ) external pure returns (bool) {
        return InterestAccrual.isUndercollateralized(
            collateralAmount, collateralPrice, principal, rateBps, elapsed, repaid, threshold
        );
    }
}

contract InterestAccrualTest is Test {
    InterestAccrualHarness internal h;

    function setUp() public {
        h = new InterestAccrualHarness();
    }

    function test_SimpleInterest_Vectors() public view {
        assertEq(h.computeSimpleInterest(1000e18, 500, 365 days), 50e18);
        assertEq(h.computeSimpleInterest(1000e18, 500, 0), 0);
        assertEq(h.computeSimpleInterest(1000e18, 0, 365 days), 0);
        assertEq(h.computeSimpleInterest(1000e18, 1000, 730 days), 200e18);
        // 30-day loan (Ghost maturity) at 5%: 1000 * 0.05 * 30 / 365, floored
        assertEq(h.computeSimpleInterest(1000e18, 500, 30 days), 4109589041095890410);
        // 508 bps for half a year
        assertEq(h.computeSimpleInterest(800e18, 508, 365 days / 2), 20.32e18);
    }

    function test_TotalDebt() public view {
        assertEq(h.totalDebt(1000e18, 500, 365 days), 1050e18);
        assertEq(h.totalDebt(1000e18, 500, 0), 1000e18);
    }

    function test_OutstandingDebt() public view {
        assertEq(h.outstandingDebt(1000e18, 500, 365 days, 0), 1050e18);
        assertEq(h.outstandingDebt(1000e18, 500, 365 days, 50e18), 1000e18);
        assertEq(h.outstandingDebt(1000e18, 500, 365 days, 1050e18), 0);
        assertEq(h.outstandingDebt(1000e18, 500, 365 days, 2000e18), 0);
    }

    function test_HealthRatio() public view {
        // 1 nETH @ $2200 against 1000 nUSD, no interest → 2.2
        assertEq(h.healthRatio(1e18, 2200e18, 1000e18, 0, 0, 0), 2.2e18);
        // same-token collateral 1500 vs 1000 → 1.5
        assertEq(h.healthRatio(1500e18, 1e18, 1000e18, 0, 0, 0), 1.5e18);
        // interest lowers health: 1050 debt
        assertEq(h.healthRatio(2100e18, 1e18, 1000e18, 500, 365 days, 0), 2e18);
        // fully repaid → max
        assertEq(h.healthRatio(1e18, 2200e18, 1000e18, 500, 365 days, 1050e18), type(uint256).max);
    }

    function test_IsUndercollateralized() public view {
        assertFalse(h.isUndercollateralized(1500e18, 1e18, 1000e18, 0, 0, 0, 1.5e18));
        assertTrue(h.isUndercollateralized(1499e18, 1e18, 1000e18, 0, 0, 0, 1.5e18));
        assertFalse(h.isUndercollateralized(1e18, 2200e18, 1000e18, 500, 365 days, 1050e18, 1.5e18));
    }

    function testFuzz_TotalDebtIsPrincipalPlusInterest(uint256 principal, uint256 rateBps, uint256 elapsed)
        public
        view
    {
        principal = bound(principal, 0, 1e36);
        rateBps = bound(rateBps, 0, 65_535);
        elapsed = bound(elapsed, 0, 100 * 365 days);
        uint256 interest = h.computeSimpleInterest(principal, rateBps, elapsed);
        assertEq(h.totalDebt(principal, rateBps, elapsed), principal + interest);
        assertEq(interest, (principal * rateBps * elapsed) / (10_000 * 365 days));
    }
}
