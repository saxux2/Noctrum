// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IPolicyEngine} from "@chainlink/policy-management/interfaces/IPolicyEngine.sol";

/// @title NoctrumVault
/// @notice Self-hosted replacement for the Chainlink Compliant Private Token (CPT) demo vault,
///         which only exists on Ethereum Sepolia. ABI-compatible with the CPT vault for every
///         call Noctrum clients make (deposit, withdrawWithTicket, register) and for the
///         off-chain policy checks used by noctrum-vault-api.
///
///         Privacy model: the vault keeps no per-user balances. noctrum-vault-api indexes
///         `Deposit` events, keeps the private ledger, and signs withdrawal tickets.
///
///         Not an implementation of INoctrumVault (that interface is a future design).
contract NoctrumVault is EIP712, Ownable {
    using SafeERC20 for IERC20;

    /// @notice EIP-712 type of a withdrawal ticket signed by `ticketSigner` (same struct as CPT).
    bytes32 public constant WITHDRAW_TICKET_TYPEHASH =
        keccak256("WithdrawTicket(address withdrawer,address token,uint256 amount,uint128 nonce,uint64 deadline)");

    /// @notice Ticket layout: bytes 0-15 nonce (uint128), 16-23 deadline (uint64), 24-88 signature (65 bytes).
    uint256 public constant TICKET_LENGTH = 89;

    /// @dev Selectors reported to the PolicyEngine, identical to CPT's ICompliantPrivateTokenVaultActions,
    ///      so ACE policies written for CPT apply unchanged.
    bytes4 internal constant DEPOSIT_ACTION = bytes4(keccak256("deposit(address,address,uint256)"));
    bytes4 internal constant WITHDRAW_ACTION = bytes4(keccak256("withdraw(address,address,uint256)"));
    bytes4 internal constant PRIVATE_TRANSFER_ACTION =
        bytes4(keccak256("privateTransfer(address,address,address,uint256)"));

    /// @notice PolicyEngine guarding each token (zero = not registered).
    mapping(address token => address policyEngine) public policyEngineOf;
    /// @notice Account that registered each token; only it can update or delete the registration.
    mapping(address token => address registrar) public registrarOf;
    /// @notice Redeemed ticket nonces.
    mapping(uint128 nonce => bool used) public usedNonce;
    /// @notice Key held by noctrum-vault-api that signs withdrawal tickets.
    address public ticketSigner;

    /// @dev Number of tokens registered against each engine. ACE only lets a target attach once,
    ///      so the vault attaches on the first registration and detaches after the last one.
    mapping(address policyEngine => uint256 count) private _engineTokenCount;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount, bytes32 indexed withdrawTicketHash);
    event TokenRegistered(address indexed token, address indexed policyEngine, address indexed registrar);
    event TokenUpdated(address indexed token, address indexed policyEngine, address indexed registrar);
    event TokenDeleted(address indexed token, address indexed registrar);
    event TicketSignerUpdated(address indexed previousSigner, address indexed newSigner);

    error TokenNotRegistered(address token);
    error TokenAlreadyRegistered(address token, address registrar);
    error ZeroAmount();
    error ZeroTicketSigner();
    error InvalidTicketLength();
    error TicketExpired(uint64 deadline);
    error TicketAlreadyUsed(uint128 nonce);
    error InvalidTicketSignature();

    constructor(address initialOwner, address ticketSigner_)
        EIP712("NoctrumPrivateToken", "0.0.1")
        Ownable(initialOwner)
    {
        _setTicketSigner(ticketSigner_);
    }

    // ── Registration ────────────────────────────────────────────

    /// @notice Register `token` with the PolicyEngine that guards its deposits and withdrawals.
    ///         Permissionless first-come registration (as CPT). The registrar can call again to
    ///         update the engine, or pass `policyEngine = address(0)` to delete the registration.
    function register(address token, address policyEngine) external {
        address registrar = registrarOf[token];
        if (registrar != address(0) && registrar != msg.sender) {
            revert TokenAlreadyRegistered(token, registrar);
        }

        address current = policyEngineOf[token];

        if (policyEngine == address(0)) {
            if (current == address(0)) revert TokenNotRegistered(token);
            delete policyEngineOf[token];
            delete registrarOf[token];
            emit TokenDeleted(token, msg.sender);
            _releaseEngine(current);
            return;
        }

        policyEngineOf[token] = policyEngine;
        if (current == address(0)) {
            registrarOf[token] = msg.sender;
            emit TokenRegistered(token, policyEngine, msg.sender);
            _useEngine(policyEngine);
        } else {
            emit TokenUpdated(token, policyEngine, msg.sender);
            if (policyEngine != current) {
                _releaseEngine(current);
                _useEngine(policyEngine);
            }
        }
    }

    // ── Deposits ────────────────────────────────────────────────

    /// @notice Deposit `amount` of `token` (requires prior approval). The vault-api credits the
    ///         sender's private balance when it indexes the `Deposit` event.
    function deposit(address token, uint256 amount) external {
        _deposit(token, amount);
    }

    /// @notice Deposit using an ERC-2612 permit signed by the sender.
    /// @dev A failing permit is ignored so a front-run permit does not block the deposit;
    ///      the transfer still needs a sufficient allowance.
    function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        try IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _deposit(token, amount);
    }

    function _deposit(address token, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        IPolicyEngine(_engine(token)).run(_depositPayload(msg.sender, token, amount));

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, token, amount);
    }

    // ── Withdrawals ─────────────────────────────────────────────

    /// @notice Redeem a withdrawal ticket issued by noctrum-vault-api to `msg.sender`.
    function withdrawWithTicket(address token, uint256 amount, bytes calldata ticket) external {
        if (amount == 0) revert ZeroAmount();
        address policyEngine = _engine(token);

        if (ticket.length != TICKET_LENGTH) revert InvalidTicketLength();
        uint128 nonce = uint128(bytes16(ticket[0:16]));
        uint64 deadline = uint64(bytes8(ticket[16:24]));

        if (block.timestamp > deadline) revert TicketExpired(deadline);
        if (usedNonce[nonce]) revert TicketAlreadyUsed(nonce);

        bytes32 digest = hashWithdrawTicket(msg.sender, token, amount, nonce, deadline);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, ticket[24:89]);
        if (err != ECDSA.RecoverError.NoError || signer != ticketSigner) revert InvalidTicketSignature();

        usedNonce[nonce] = true;

        IPolicyEngine(policyEngine).run(_withdrawPayload(msg.sender, token, amount));

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, token, amount, digest);
    }

    /// @notice EIP-712 digest a ticket signature must cover. Also the `withdrawTicketHash` in `Withdraw`.
    function hashWithdrawTicket(address withdrawer, address token, uint256 amount, uint128 nonce, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(abi.encode(WITHDRAW_TICKET_TYPEHASH, withdrawer, token, amount, nonce, deadline))
        );
    }

    // ── Policy dry-runs (eth_call from noctrum-vault-api) ──────

    /// @notice Reverts if the PolicyEngine would reject the deposit.
    function checkDepositAllowed(address depositor, address token, uint256 amount) external view {
        IPolicyEngine(_engine(token)).check(_depositPayload(depositor, token, amount));
    }

    /// @notice Reverts if the PolicyEngine would reject the withdrawal. Does not validate a ticket.
    function checkWithdrawAllowed(address withdrawer, address token, uint256 amount) external view {
        IPolicyEngine(_engine(token)).check(_withdrawPayload(withdrawer, token, amount));
    }

    /// @notice Reverts if the PolicyEngine would reject an off-chain private transfer.
    function checkPrivateTransferAllowed(address from, address to, address token, uint256 amount) external view {
        IPolicyEngine(_engine(token)).check(
            IPolicyEngine.Payload({
                selector: PRIVATE_TRANSFER_ACTION,
                sender: from,
                data: abi.encode(from, to, token, amount),
                context: ""
            })
        );
    }

    // ── Admin ───────────────────────────────────────────────────

    /// @notice Rotate the withdrawal-ticket signer. Outstanding tickets from the old signer stop working.
    function setTicketSigner(address newSigner) external onlyOwner {
        _setTicketSigner(newSigner);
    }

    // ── Internal ────────────────────────────────────────────────

    function _setTicketSigner(address newSigner) internal {
        if (newSigner == address(0)) revert ZeroTicketSigner();
        emit TicketSignerUpdated(ticketSigner, newSigner);
        ticketSigner = newSigner;
    }

    function _engine(address token) internal view returns (address policyEngine) {
        policyEngine = policyEngineOf[token];
        if (policyEngine == address(0)) revert TokenNotRegistered(token);
    }

    function _useEngine(address policyEngine) internal {
        if (_engineTokenCount[policyEngine]++ == 0) IPolicyEngine(policyEngine).attach();
    }

    function _releaseEngine(address policyEngine) internal {
        if (--_engineTokenCount[policyEngine] == 0) IPolicyEngine(policyEngine).detach();
    }

    function _depositPayload(address depositor, address token, uint256 amount)
        internal
        pure
        returns (IPolicyEngine.Payload memory)
    {
        return IPolicyEngine.Payload({
            selector: DEPOSIT_ACTION, sender: depositor, data: abi.encode(depositor, token, amount), context: ""
        });
    }

    function _withdrawPayload(address withdrawer, address token, uint256 amount)
        internal
        pure
        returns (IPolicyEngine.Payload memory)
    {
        return IPolicyEngine.Payload({
            selector: WITHDRAW_ACTION, sender: withdrawer, data: abi.encode(withdrawer, token, amount), context: ""
        });
    }
}
