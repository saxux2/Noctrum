// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GhostSwapPool
/// @notice Multi-token swap pool with owner-managed prices.
///         Holds N tokens, owner sets USD price per token,
///         users swap at the current rate.
contract GhostSwapPool is Ownable {
    using SafeERC20 for IERC20;

    /// @notice USD price per token, scaled to 18 decimals.
    ///         e.g. gUSD = 1e18 ($1), gETH = 2200e18 ($2200)
    mapping(address => uint256) public tokenPriceUsd;
    mapping(address => bool) public supportedTokens;

    address[] public tokenList;

    event TokenAdded(address indexed token, uint256 priceUsd);
    event PriceUpdated(address indexed token, uint256 newPriceUsd);
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidityAdded(address indexed token, uint256 amount);
    event LiquidityRemoved(address indexed token, uint256 amount);

    constructor(address _owner) Ownable(_owner) {}

    // ── Admin ──────────────────────────────────────────────

    function addToken(address token, uint256 priceUsd) external onlyOwner {
        require(!supportedTokens[token], "Already added");
        require(priceUsd > 0, "Price must be > 0");
        supportedTokens[token] = true;
        tokenPriceUsd[token] = priceUsd;
        tokenList.push(token);
        emit TokenAdded(token, priceUsd);
    }

    function setPrice(address token, uint256 priceUsd) external onlyOwner {
        require(supportedTokens[token], "Token not supported");
        require(priceUsd > 0, "Price must be > 0");
        tokenPriceUsd[token] = priceUsd;
        emit PriceUpdated(token, priceUsd);
    }

    function addLiquidity(address token, uint256 amount) external onlyOwner {
        require(supportedTokens[token], "Token not supported");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(token, amount);
    }

    function removeLiquidity(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit LiquidityRemoved(token, amount);
    }

    // ── Swap ───────────────────────────────────────────────

    /// @notice Calculate output amount for a given input.
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (uint256) {
        require(
            supportedTokens[tokenIn] && supportedTokens[tokenOut],
            "Token not supported"
        );
        uint256 priceIn = tokenPriceUsd[tokenIn];
        uint256 priceOut = tokenPriceUsd[tokenOut];
        // amountOut = amountIn * priceIn / priceOut
        return (amountIn * priceIn) / priceOut;
    }

    /// @notice Swap tokenIn for tokenOut.
    /// @param amountIn   Amount of tokenIn to send.
    /// @param minAmountOut Minimum acceptable tokenOut (slippage guard).
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external {
        require(tokenIn != tokenOut, "Same token");
        require(amountIn > 0, "Zero amount");

        uint256 amountOut = getAmountOut(tokenIn, tokenOut, amountIn);
        require(amountOut >= minAmountOut, "Slippage exceeded");
        require(
            IERC20(tokenOut).balanceOf(address(this)) >= amountOut,
            "Insufficient pool liquidity"
        );

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // ── Views ──────────────────────────────────────────────

    function poolBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function tokenCount() external view returns (uint256) {
        return tokenList.length;
    }
}
