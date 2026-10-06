// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SimpleToken} from "../src/SimpleToken.sol";
import {NoctrumSwapPool} from "../src/NoctrumSwapPool.sol";

contract NoctrumSwapPoolTest is Test {
    event TokenAdded(address indexed token, uint256 priceUsd);
    event PriceUpdated(address indexed token, uint256 newPriceUsd);
    event Swapped(
        address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
    );
    event LiquidityAdded(address indexed token, uint256 amount);
    event LiquidityRemoved(address indexed token, uint256 amount);

    NoctrumSwapPool internal pool;
    SimpleToken internal nUSD;
    SimpleToken internal nETH;
    SimpleToken internal other;
    address internal owner = makeAddr("owner");
    address internal user = makeAddr("user");

    function setUp() public {
        nUSD = new SimpleToken("Noctrum USD", "nUSD", owner);
        nETH = new SimpleToken("Noctrum ETH", "nETH", owner);
        other = new SimpleToken("Other", "OTH", owner);
        pool = new NoctrumSwapPool(owner);

        vm.startPrank(owner);
        pool.addToken(address(nUSD), 1e18);
        pool.addToken(address(nETH), 2200e18);

        nUSD.mint(owner, 1_000_000e18);
        nETH.mint(owner, 1_000e18);
        nUSD.approve(address(pool), type(uint256).max);
        nETH.approve(address(pool), type(uint256).max);
        pool.addLiquidity(address(nUSD), 100_000e18);
        pool.addLiquidity(address(nETH), 100e18);

        nETH.mint(user, 10e18);
        nUSD.mint(user, 10_000e18);
        vm.stopPrank();

        vm.startPrank(user);
        nUSD.approve(address(pool), type(uint256).max);
        nETH.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    // ── Admin ──────────────────────────────────────────────

    function test_Constructor_SetsOwner() public view {
        assertEq(pool.owner(), owner);
        assertEq(pool.tokenCount(), 2);
        assertEq(pool.tokenList(0), address(nUSD));
        assertEq(pool.tokenList(1), address(nETH));
        assertTrue(pool.supportedTokens(address(nETH)));
        assertEq(pool.tokenPriceUsd(address(nETH)), 2200e18);
    }

    function test_AddToken_EmitsAndStores() public {
        vm.expectEmit(address(pool));
        emit TokenAdded(address(other), 5e18);
        vm.prank(owner);
        pool.addToken(address(other), 5e18);

        assertTrue(pool.supportedTokens(address(other)));
        assertEq(pool.tokenPriceUsd(address(other)), 5e18);
        assertEq(pool.tokenCount(), 3);
        assertEq(pool.tokenList(2), address(other));
    }

    function test_AddToken_RevertsWhenAlreadyAdded() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Already added"));
        pool.addToken(address(nUSD), 1e18);
    }

    function test_AddToken_RevertsOnZeroPrice() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Price must be > 0"));
        pool.addToken(address(other), 0);
    }

    function test_AddToken_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        pool.addToken(address(other), 1e18);
    }

    function test_SetPrice_EmitsAndStores() public {
        vm.expectEmit(address(pool));
        emit PriceUpdated(address(nETH), 2500e18);
        vm.prank(owner);
        pool.setPrice(address(nETH), 2500e18);
        assertEq(pool.tokenPriceUsd(address(nETH)), 2500e18);
    }

    function test_SetPrice_RevertsForUnsupportedToken() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Token not supported"));
        pool.setPrice(address(other), 1e18);
    }

    function test_SetPrice_RevertsOnZeroPrice() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Price must be > 0"));
        pool.setPrice(address(nETH), 0);
    }

    function test_SetPrice_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        pool.setPrice(address(nETH), 1e18);
    }

    function test_AddLiquidity_TransfersAndEmits() public {
        uint256 before = pool.poolBalance(address(nUSD));
        vm.expectEmit(address(pool));
        emit LiquidityAdded(address(nUSD), 50e18);
        vm.prank(owner);
        pool.addLiquidity(address(nUSD), 50e18);
        assertEq(pool.poolBalance(address(nUSD)), before + 50e18);
    }

    function test_AddLiquidity_RevertsForUnsupportedToken() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Token not supported"));
        pool.addLiquidity(address(other), 1e18);
    }

    function test_AddLiquidity_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        pool.addLiquidity(address(nUSD), 1e18);
    }

    function test_RemoveLiquidity_TransfersAndEmits() public {
        uint256 ownerBefore = nETH.balanceOf(owner);
        vm.expectEmit(address(pool));
        emit LiquidityRemoved(address(nETH), 10e18);
        vm.prank(owner);
        pool.removeLiquidity(address(nETH), 10e18);
        assertEq(pool.poolBalance(address(nETH)), 90e18);
        assertEq(nETH.balanceOf(owner), ownerBefore + 10e18);
    }

    /// Ghost parity: removeLiquidity does not check `supportedTokens`, so stray tokens can be recovered.
    function test_RemoveLiquidity_NoSupportCheck() public {
        vm.prank(owner);
        other.mint(address(pool), 7e18);

        vm.prank(owner);
        pool.removeLiquidity(address(other), 7e18);
        assertEq(other.balanceOf(owner), 7e18);
        assertEq(pool.poolBalance(address(other)), 0);
    }

    function test_RemoveLiquidity_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        pool.removeLiquidity(address(nETH), 1);
    }

    // ── Quote ──────────────────────────────────────────────

    function test_GetAmountOut_EthToUsd() public view {
        assertEq(pool.getAmountOut(address(nETH), address(nUSD), 1e18), 2200e18);
    }

    function test_GetAmountOut_UsdToEth() public view {
        assertEq(pool.getAmountOut(address(nUSD), address(nETH), 2200e18), 1e18);
        // floor division
        assertEq(pool.getAmountOut(address(nUSD), address(nETH), 1), 0);
    }

    function test_GetAmountOut_RevertsForUnsupportedTokenIn() public {
        vm.expectRevert(bytes("Token not supported"));
        pool.getAmountOut(address(other), address(nUSD), 1e18);
    }

    function test_GetAmountOut_RevertsForUnsupportedTokenOut() public {
        vm.expectRevert(bytes("Token not supported"));
        pool.getAmountOut(address(nUSD), address(other), 1e18);
    }

    function testFuzz_GetAmountOut(uint256 amountIn, uint256 priceIn, uint256 priceOut) public {
        amountIn = bound(amountIn, 0, 1e30);
        priceIn = bound(priceIn, 1, 1e30);
        priceOut = bound(priceOut, 1, 1e30);
        vm.startPrank(owner);
        pool.setPrice(address(nETH), priceIn);
        pool.setPrice(address(nUSD), priceOut);
        vm.stopPrank();
        assertEq(pool.getAmountOut(address(nETH), address(nUSD), amountIn), (amountIn * priceIn) / priceOut);
    }

    // ── Swap ───────────────────────────────────────────────

    function test_Swap_EthForUsd() public {
        vm.expectEmit(address(pool));
        emit Swapped(user, address(nETH), address(nUSD), 1e18, 2200e18);
        vm.prank(user);
        pool.swap(address(nETH), address(nUSD), 1e18, 2178e18); // 1% slippage, as the client

        assertEq(nETH.balanceOf(user), 9e18);
        assertEq(nUSD.balanceOf(user), 10_000e18 + 2200e18);
        assertEq(pool.poolBalance(address(nETH)), 101e18);
        assertEq(pool.poolBalance(address(nUSD)), 100_000e18 - 2200e18);
    }

    function test_Swap_UsdForEth() public {
        vm.expectEmit(address(pool));
        emit Swapped(user, address(nUSD), address(nETH), 4400e18, 2e18);
        vm.prank(user);
        pool.swap(address(nUSD), address(nETH), 4400e18, 2e18);

        assertEq(nETH.balanceOf(user), 12e18);
        assertEq(nUSD.balanceOf(user), 5600e18);
    }

    function test_Swap_RevertsOnSameToken() public {
        vm.prank(user);
        vm.expectRevert(bytes("Same token"));
        pool.swap(address(nUSD), address(nUSD), 1e18, 0);
    }

    function test_Swap_RevertsOnZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(bytes("Zero amount"));
        pool.swap(address(nETH), address(nUSD), 0, 0);
    }

    function test_Swap_RevertsForUnsupportedToken() public {
        vm.prank(user);
        vm.expectRevert(bytes("Token not supported"));
        pool.swap(address(other), address(nUSD), 1e18, 0);
    }

    function test_Swap_RevertsOnSlippage() public {
        vm.prank(user);
        vm.expectRevert(bytes("Slippage exceeded"));
        pool.swap(address(nETH), address(nUSD), 1e18, 2200e18 + 1);
    }

    function test_Swap_RevertsOnInsufficientLiquidity() public {
        vm.prank(owner);
        nETH.mint(user, 100e18);
        // 50 nETH → 110,000 nUSD > 100,000 nUSD in the pool
        vm.prank(user);
        vm.expectRevert(bytes("Insufficient pool liquidity"));
        pool.swap(address(nETH), address(nUSD), 50e18, 0);
    }

    function test_PoolBalance_And_TokenCount() public view {
        assertEq(pool.poolBalance(address(nUSD)), 100_000e18);
        assertEq(pool.poolBalance(address(nETH)), 100e18);
        assertEq(pool.poolBalance(address(other)), 0);
        assertEq(pool.tokenCount(), 2);
    }
}
