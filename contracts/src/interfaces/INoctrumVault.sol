// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IGhostVault
/// @notice Core vault for GHOST Protocol. Holds ERC20 tokens, enforces PolicyEngine
///         compliance, issues withdrawal tickets, and supports collateral earmarking
///         so locked funds cannot be withdrawn.
///
///         Privacy model: the vault stores aggregate totals per token, NOT per-user
///         balances. Individual balances are tracked off-chain in the private transfer
///         layer. The vault only knows: totalDeposited[token] and totalLocked[token].
interface IGhostVault {
    // ── Events ──────────────────────────────────────────────────────────

    event Deposited(
        address indexed account,
        address indexed token,
        uint256 amount
    );

    event Withdrawn(
        address indexed account,
        address indexed token,
        uint256 amount,
        bytes32 indexed ticketHash
    );

    event TokenRegistered(
        address indexed token,
        address indexed policyEngine
    );

    event BalanceLocked(address indexed token, uint256 amount);
    event BalanceReleased(address indexed token, uint256 amount);
    event EmergencyPaused(address indexed pauser, PauseScope scope);
    event EmergencyUnpaused(address indexed admin);

    // ── Errors ──────────────────────────────────────────────────────────

    error TokenNotRegistered(address token);
    error InsufficientFreeBalance(uint256 free, uint256 requested);
    error TicketExpired(bytes32 ticketHash, uint256 expiry);
    error TicketAlreadyUsed(bytes32 ticketHash);
    error InvalidTicketSignature();
    error PolicyCheckFailed(address token, address account);
    error ZeroAmount();
    error VaultPaused();
    error DepositsPaused();
    error WithdrawalsPaused();
    error LendingPaused();

    // ── Enums ───────────────────────────────────────────────────────────

    enum PauseScope {
        NONE,               // Not paused
        ALL,                // Everything paused
        DEPOSITS_ONLY,      // No new deposits, withdrawals OK
        WITHDRAWALS_ONLY,   // No withdrawals, deposits OK
        LENDING_ONLY        // No new collateral locks, existing loans continue
    }

    // ── Deposit ─────────────────────────────────────────────────────────

    /// @notice Deposit ERC20 tokens into the vault.
    ///         Requirements:
    ///         - Token must be registered via register()
    ///         - Caller must have approved this contract for `amount`
    ///         - PolicyEngine.checkDeposit() must pass
    ///         - Vault must not be paused for deposits
    ///
    ///         After deposit, the off-chain private transfer layer credits
    ///         the depositor's shielded balance. The vault only increments
    ///         totalDeposited[token].
    ///
    /// @param token The ERC20 token address (gUSD or gETH)
    /// @param amount The amount to deposit (18 decimals)
    function deposit(address token, uint256 amount) external;

    // ── Withdraw ────────────────────────────────────────────────────────

    /// @notice Withdraw tokens using a signed ticket from the off-chain API.
    ///         The ticket system prevents unauthorized withdrawals:
    ///         1. User requests ticket from GHOST server (EIP-712 signed)
    ///         2. Server verifies user has sufficient private balance
    ///         3. Server issues ticket signed by TICKET_SIGNER_ROLE
    ///         4. User redeems ticket on-chain
    ///
    ///         The vault checks:
    ///         - Ticket signature is valid (TICKET_SIGNER_ROLE)
    ///         - Ticket has not expired
    ///         - Ticket has not been used before (replay protection)
    ///         - freeBalance(token) >= amount (not locked as collateral)
    ///         - PolicyEngine.checkWithdraw() passes
    ///
    /// @param token The ERC20 token address
    /// @param amount The amount to withdraw
    /// @param ticket Encoded ticket: abi.encode(nonce, expiry, signature)
    function withdrawWithTicket(
        address token,
        uint256 amount,
        bytes calldata ticket
    ) external;

    // ── Registration ────────────────────────────────────────────────────

    /// @notice Register a token with its PolicyEngine for compliance checks.
    ///         Only callable by DEFAULT_ADMIN_ROLE.
    /// @param token The ERC20 token address
    /// @param policyEngine The PolicyEngine contract address
    function register(address token, address policyEngine) external;

    // ── Collateral earmarking (CollateralManager only) ──────────────────

    /// @notice Earmark vault balance as locked collateral.
    ///         Locked balance cannot be withdrawn via withdrawWithTicket().
    ///         Only callable by the CollateralManager contract (COLLATERAL_ROLE).
    ///
    ///         The vault does NOT track who the collateral belongs to —
    ///         that is the CollateralManager's responsibility.
    ///
    /// @param token The token to lock
    /// @param amount The amount to earmark as locked
    function lockBalance(address token, uint256 amount) external;

    /// @notice Release previously locked vault balance.
    ///         Only callable by COLLATERAL_ROLE.
    /// @param token The token to release
    /// @param amount The amount to un-earmark
    function releaseBalance(address token, uint256 amount) external;

    // ── Views ───────────────────────────────────────────────────────────

    /// @notice Total ERC20 balance held by the vault for a token.
    ///         This equals the actual token.balanceOf(vault).
    function totalDeposited(address token) external view returns (uint256);

    /// @notice Total amount currently locked as collateral for a token.
    function totalLocked(address token) external view returns (uint256);

    /// @notice Free balance available for withdrawal: totalDeposited - totalLocked.
    function freeBalance(address token) external view returns (uint256);

    /// @notice Get the PolicyEngine registered for a token.
    function getPolicyEngine(address token) external view returns (address);

    /// @notice Check if a ticket hash has been used.
    function isTicketUsed(bytes32 ticketHash) external view returns (bool);

    /// @notice Current pause scope.
    function currentPauseScope() external view returns (PauseScope);

    // ── Emergency ───────────────────────────────────────────────────────

    /// @notice Pause vault operations with specified scope.
    ///         Only callable by PAUSER_ROLE.
    /// @param scope The granularity of the pause
    function pause(PauseScope scope) external;

    /// @notice Unpause all operations.
    ///         Only callable by DEFAULT_ADMIN_ROLE.
    function unpause() external;
}
