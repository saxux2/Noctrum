// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/IERC6093.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PolicyEngine} from "@chainlink/policy-management/core/PolicyEngine.sol";
import {IPolicyEngine} from "@chainlink/policy-management/interfaces/IPolicyEngine.sol";
import {SimpleToken} from "../src/SimpleToken.sol";
import {NoctrumVault} from "../src/NoctrumVault.sol";

contract NoctrumVaultTest is Test {
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount, bytes32 indexed withdrawTicketHash);
    event TokenRegistered(address indexed token, address indexed policyEngine, address indexed registrar);
    event TokenUpdated(address indexed token, address indexed policyEngine, address indexed registrar);
    event TokenDeleted(address indexed token, address indexed registrar);
    event TicketSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event TargetAttached(address indexed target);
    event TargetDetached(address indexed target);

    bytes32 internal constant TICKET_TYPEHASH =
        keccak256("WithdrawTicket(address withdrawer,address token,uint256 amount,uint128 nonce,uint64 deadline)");
    bytes4 internal constant DEPOSIT_ACTION = bytes4(keccak256("deposit(address,address,uint256)"));
    bytes4 internal constant WITHDRAW_ACTION = bytes4(keccak256("withdraw(address,address,uint256)"));
    bytes4 internal constant PRIVATE_TRANSFER_ACTION =
        bytes4(keccak256("privateTransfer(address,address,address,uint256)"));

    NoctrumVault internal vault;
    PolicyEngine internal engine;
    SimpleToken internal nUSD;
    SimpleToken internal nETH;

    address internal owner = makeAddr("owner");
    address internal registrar = makeAddr("registrar");
    address internal alice;
    uint256 internal aliceKey;
    address internal bob = makeAddr("bob");
    address internal signer;
    uint256 internal signerKey;

    function setUp() public {
        (signer, signerKey) = makeAddrAndKey("ticket-signer");
        (alice, aliceKey) = makeAddrAndKey("alice");

        engine = _deployEngine(true);
        vault = new NoctrumVault(owner, signer);
        nUSD = new SimpleToken("Noctrum USD", "nUSD", owner);
        nETH = new SimpleToken("Noctrum ETH", "nETH", owner);

        vm.prank(registrar);
        vault.register(address(nUSD), address(engine));

        vm.startPrank(owner);
        nUSD.mint(alice, 1_000e18);
        nETH.mint(alice, 10e18);
        vm.stopPrank();

        vm.startPrank(alice);
        nUSD.approve(address(vault), type(uint256).max);
        nETH.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    // ── Helpers ─────────────────────────────────────────────────

    /// Same deployment as script/02_DeployPolicyEngine.s.sol (proxy, owner = this test).
    function _deployEngine(bool defaultAllow) internal returns (PolicyEngine) {
        PolicyEngine impl = new PolicyEngine();
        bytes memory init = abi.encodeWithSelector(PolicyEngine.initialize.selector, defaultAllow, address(this));
        return PolicyEngine(address(new ERC1967Proxy(address(impl), init)));
    }

    function _digest(address withdrawer, address token, uint256 amount, uint128 nonce, uint64 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NoctrumPrivateToken"),
                keccak256("0.0.1"),
                block.chainid,
                address(vault)
            )
        );
        bytes32 structHash = keccak256(abi.encode(TICKET_TYPEHASH, withdrawer, token, amount, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// Builds the 89-byte ticket: nonce (16) ‖ deadline (8) ‖ r (32) ‖ s (32) ‖ v (1).
    function _ticket(uint256 key, address withdrawer, address token, uint256 amount, uint128 nonce, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(withdrawer, token, amount, nonce, deadline));
        return abi.encodePacked(nonce, deadline, r, s, v);
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    /// Alice deposits so the vault holds funds to withdraw.
    function _fundVault(uint256 amount) internal {
        vm.prank(alice);
        vault.deposit(address(nUSD), amount);
    }

    function _rejectAll() internal {
        engine.setTargetDefaultPolicyAllow(address(vault), false);
    }

    // ── Constructor / constants ─────────────────────────────────

    function test_Constructor() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.ticketSigner(), signer);
        assertEq(vault.TICKET_LENGTH(), 89);
        assertEq(vault.WITHDRAW_TICKET_TYPEHASH(), TICKET_TYPEHASH);
    }

    function test_Constructor_EmitsTicketSignerUpdated() public {
        vm.expectEmit();
        emit TicketSignerUpdated(address(0), signer);
        new NoctrumVault(owner, signer);
    }

    function test_Constructor_RevertsOnZeroSigner() public {
        vm.expectRevert(NoctrumVault.ZeroTicketSigner.selector);
        new NoctrumVault(owner, address(0));
    }

    function test_Eip712Domain() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            vault.eip712Domain();
        assertEq(name, "NoctrumPrivateToken");
        assertEq(version, "0.0.1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(vault));
    }

    function test_HashWithdrawTicket_MatchesEip712() public view {
        assertEq(
            vault.hashWithdrawTicket(alice, address(nUSD), 5e18, 7, 1234),
            _digest(alice, address(nUSD), 5e18, 7, 1234)
        );
    }

    // ── register ────────────────────────────────────────────────

    function test_Register_First() public {
        PolicyEngine engine2 = _deployEngine(true);
        NoctrumVault vault2 = new NoctrumVault(owner, signer);

        vm.expectEmit(address(vault2));
        emit TokenRegistered(address(nETH), address(engine2), alice);
        vm.expectEmit(address(engine2));
        emit TargetAttached(address(vault2));
        vm.prank(alice);
        vault2.register(address(nETH), address(engine2));

        assertEq(vault2.policyEngineOf(address(nETH)), address(engine2));
        assertEq(vault2.registrarOf(address(nETH)), alice);
    }

    function test_Register_SetUpState() public view {
        assertEq(vault.policyEngineOf(address(nUSD)), address(engine));
        assertEq(vault.registrarOf(address(nUSD)), registrar);
        assertEq(vault.policyEngineOf(address(nETH)), address(0));
        assertEq(vault.registrarOf(address(nETH)), address(0));
    }

    function test_Register_SharedEngineAttachesOnce() public {
        vm.recordLogs();
        vm.prank(alice);
        vault.register(address(nETH), address(engine));
        // only TokenRegistered; no TargetAttached from the engine
        assertEq(vm.getRecordedLogs().length, 1);
        assertEq(vault.registrarOf(address(nETH)), alice);
    }

    function test_Register_DuplicateByOtherReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TokenAlreadyRegistered.selector, address(nUSD), registrar));
        vault.register(address(nUSD), address(engine));
    }

    function test_Register_RegistrarUpdatesSameEngine() public {
        vm.expectEmit(address(vault));
        emit TokenUpdated(address(nUSD), address(engine), registrar);
        vm.recordLogs();
        vm.prank(registrar);
        vault.register(address(nUSD), address(engine));
        assertEq(vm.getRecordedLogs().length, 1); // no detach/attach
        assertEq(vault.policyEngineOf(address(nUSD)), address(engine));
        assertEq(vault.registrarOf(address(nUSD)), registrar);
    }

    function test_Register_RegistrarUpdatesToNewEngine() public {
        PolicyEngine engine2 = _deployEngine(true);

        vm.expectEmit(address(vault));
        emit TokenUpdated(address(nUSD), address(engine2), registrar);
        vm.expectEmit(address(engine));
        emit TargetDetached(address(vault));
        vm.expectEmit(address(engine2));
        emit TargetAttached(address(vault));
        vm.prank(registrar);
        vault.register(address(nUSD), address(engine2));

        assertEq(vault.policyEngineOf(address(nUSD)), address(engine2));
        assertEq(vault.registrarOf(address(nUSD)), registrar);

        // the new engine now governs deposits
        engine2.setTargetDefaultPolicyAllow(address(vault), false);
        vm.prank(alice);
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.deposit(address(nUSD), 1e18);
    }

    function test_Register_UpdateKeepsSharedEngineAttached() public {
        PolicyEngine engine2 = _deployEngine(true);
        vm.prank(alice);
        vault.register(address(nETH), address(engine));

        // moving nUSD away must not detach `engine`, which still guards nETH
        vm.prank(registrar);
        vault.register(address(nUSD), address(engine2));

        vm.prank(alice);
        vault.deposit(address(nETH), 1e18);
    }

    function test_Register_RegistrarDeletes() public {
        vm.expectEmit(address(vault));
        emit TokenDeleted(address(nUSD), registrar);
        vm.expectEmit(address(engine));
        emit TargetDetached(address(vault));
        vm.prank(registrar);
        vault.register(address(nUSD), address(0));

        assertEq(vault.policyEngineOf(address(nUSD)), address(0));
        assertEq(vault.registrarOf(address(nUSD)), address(0));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TokenNotRegistered.selector, address(nUSD)));
        vault.deposit(address(nUSD), 1e18);
    }

    function test_Register_DeleteKeepsSharedEngineAttached() public {
        vm.prank(alice);
        vault.register(address(nETH), address(engine));

        vm.recordLogs();
        vm.prank(registrar);
        vault.register(address(nUSD), address(0));
        assertEq(vm.getRecordedLogs().length, 1); // TokenDeleted only, no detach

        vm.prank(alice);
        vault.deposit(address(nETH), 1e18);
    }

    function test_Register_DeleteByOtherReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TokenAlreadyRegistered.selector, address(nUSD), registrar));
        vault.register(address(nUSD), address(0));
    }

    function test_Register_DeleteUnregisteredReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TokenNotRegistered.selector, address(nETH)));
        vault.register(address(nETH), address(0));
    }

    function test_Register_ReRegisterAfterDelete() public {
        vm.prank(registrar);
        vault.register(address(nUSD), address(0));

        vm.expectEmit(address(vault));
        emit TokenRegistered(address(nUSD), address(engine), alice);
        vm.expectEmit(address(engine));
        emit TargetAttached(address(vault));
        vm.prank(alice);
        vault.register(address(nUSD), address(engine));
        assertEq(vault.registrarOf(address(nUSD)), alice);
    }

    // ── deposit ─────────────────────────────────────────────────

    function test_Deposit_TransfersAndEmits() public {
        vm.expectEmit(address(vault));
        emit Deposit(alice, address(nUSD), 100e18);
        vm.prank(alice);
        vault.deposit(address(nUSD), 100e18);

        assertEq(nUSD.balanceOf(address(vault)), 100e18);
        assertEq(nUSD.balanceOf(alice), 900e18);
    }

    function test_Deposit_RevertsWhenUnregistered() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TokenNotRegistered.selector, address(nETH)));
        vault.deposit(address(nETH), 1e18);
    }

    function test_Deposit_RevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.ZeroAmount.selector);
        vault.deposit(address(nUSD), 0);
    }

    function test_Deposit_RevertsWithoutAllowance() public {
        vm.prank(alice);
        nUSD.approve(address(vault), 0);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 1e18)
        );
        vault.deposit(address(nUSD), 1e18);
    }

    function test_Deposit_RunsPolicyEngine() public {
        bytes memory data = abi.encode(alice, address(nUSD), 1e18);
        vm.expectCall(
            address(engine),
            abi.encodeCall(
                IPolicyEngine.run,
                (IPolicyEngine.Payload({selector: DEPOSIT_ACTION, sender: alice, data: data, context: ""}))
            )
        );
        vm.prank(alice);
        vault.deposit(address(nUSD), 1e18);
    }

    function test_Deposit_RevertsWhenPolicyRejects() public {
        _rejectAll();
        vm.prank(alice);
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.deposit(address(nUSD), 1e18);
    }

    // ── depositWithPermit ───────────────────────────────────────

    function _permitSig(uint256 amount, uint256 deadline) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                alice,
                address(vault),
                amount,
                nUSD.nonces(alice),
                deadline
            )
        );
        (v, r, s) = vm.sign(aliceKey, keccak256(abi.encodePacked("\x19\x01", nUSD.DOMAIN_SEPARATOR(), structHash)));
    }

    function test_DepositWithPermit() public {
        vm.prank(alice);
        nUSD.approve(address(vault), 0);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(50e18, deadline);

        vm.expectEmit(address(vault));
        emit Deposit(alice, address(nUSD), 50e18);
        vm.prank(alice);
        vault.depositWithPermit(address(nUSD), 50e18, deadline, v, r, s);

        assertEq(nUSD.balanceOf(address(vault)), 50e18);
        assertEq(nUSD.allowance(alice, address(vault)), 0);
    }

    function test_DepositWithPermit_FrontRunPermitStillDeposits() public {
        vm.prank(alice);
        nUSD.approve(address(vault), 0);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(50e18, deadline);

        // someone submits the permit first; the vault's own permit call then fails and is ignored
        vm.prank(bob);
        nUSD.permit(alice, address(vault), 50e18, deadline, v, r, s);

        vm.prank(alice);
        vault.depositWithPermit(address(nUSD), 50e18, deadline, v, r, s);
        assertEq(nUSD.balanceOf(address(vault)), 50e18);
    }

    function test_DepositWithPermit_BadPermitNoAllowanceReverts() public {
        vm.prank(alice);
        nUSD.approve(address(vault), 0);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 50e18)
        );
        vault.depositWithPermit(address(nUSD), 50e18, block.timestamp + 1 hours, 27, bytes32(0), bytes32(0));
    }

    function test_DepositWithPermit_RevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.ZeroAmount.selector);
        vault.depositWithPermit(address(nUSD), 0, block.timestamp, 27, bytes32(0), bytes32(0));
    }

    // ── withdrawWithTicket ──────────────────────────────────────

    function test_Withdraw_ValidTicket() public {
        _fundVault(100e18);
        uint64 deadline = _deadline();
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 40e18, 1, deadline);
        assertEq(ticket.length, 89);

        bytes32 expectedHash = _digest(alice, address(nUSD), 40e18, 1, deadline);
        vm.expectEmit(address(vault));
        emit Withdraw(alice, address(nUSD), 40e18, expectedHash);
        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), 40e18, ticket);

        assertEq(nUSD.balanceOf(alice), 940e18);
        assertEq(nUSD.balanceOf(address(vault)), 60e18);
        assertTrue(vault.usedNonce(1));
    }

    function test_Withdraw_MaxNonceAndDeadline() public {
        _fundVault(100e18);
        uint128 nonce = type(uint128).max;
        uint64 deadline = type(uint64).max;
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, nonce, deadline);

        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
        assertTrue(vault.usedNonce(nonce));
    }

    function test_Withdraw_AtDeadlineSucceeds() public {
        _fundVault(100e18);
        uint64 deadline = _deadline();
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, deadline);
        vm.warp(deadline);

        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsWhenExpired() public {
        _fundVault(100e18);
        uint64 deadline = _deadline();
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, deadline);
        vm.warp(uint256(deadline) + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TicketExpired.selector, deadline));
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsOnReusedNonce() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 9, _deadline());
        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TicketAlreadyUsed.selector, uint128(9)));
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);

        // a different ticket reusing the nonce is rejected too
        bytes memory ticket2 = _ticket(signerKey, alice, address(nUSD), 2e18, 9, _deadline());
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TicketAlreadyUsed.selector, uint128(9)));
        vault.withdrawWithTicket(address(nUSD), 2e18, ticket2);
    }

    function test_Withdraw_RevertsForWrongSigner() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(aliceKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsForWrongSender() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(bob);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsForWrongAmount() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nUSD), 2e18, ticket);
    }

    function test_Withdraw_RevertsForWrongToken() public {
        _fundVault(100e18);
        vm.prank(alice);
        vault.register(address(nETH), address(engine));
        vm.prank(alice);
        vault.deposit(address(nETH), 5e18);

        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nETH), 1e18, ticket);
    }

    function test_Withdraw_RevertsForTamperedDeadline() public {
        _fundVault(100e18);
        uint64 deadline = _deadline();
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, deadline);
        ticket[23] = bytes1(uint8(ticket[23]) ^ 0x01); // last deadline byte
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsForMalformedSignature() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        ticket[88] = bytes1(uint8(0)); // v = 0 → ECDSA recover error
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsOnBadLength() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());

        bytes memory short = new bytes(88);
        for (uint256 i; i < 88; i++) short[i] = ticket[i];
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketLength.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, short);

        bytes memory long = abi.encodePacked(ticket, bytes1(0));
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketLength.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, long);

        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketLength.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, "");
    }

    function test_Withdraw_RevertsOnZeroAmount() public {
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 0, 1, _deadline());
        vm.prank(alice);
        vm.expectRevert(NoctrumVault.ZeroAmount.selector);
        vault.withdrawWithTicket(address(nUSD), 0, ticket);
    }

    function test_Withdraw_RevertsWhenUnregistered() public {
        bytes memory ticket = _ticket(signerKey, alice, address(nETH), 1e18, 1, _deadline());
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NoctrumVault.TokenNotRegistered.selector, address(nETH)));
        vault.withdrawWithTicket(address(nETH), 1e18, ticket);
    }

    function test_Withdraw_RevertsWhenVaultUnderfunded() public {
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(vault), 0, 1e18)
        );
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
        assertFalse(vault.usedNonce(1));
    }

    function test_Withdraw_RunsPolicyEngine() public {
        _fundVault(100e18);
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        bytes memory data = abi.encode(alice, address(nUSD), 1e18);
        vm.expectCall(
            address(engine),
            abi.encodeCall(
                IPolicyEngine.run,
                (IPolicyEngine.Payload({selector: WITHDRAW_ACTION, sender: alice, data: data, context: ""}))
            )
        );
        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
    }

    function test_Withdraw_RevertsWhenPolicyRejects() public {
        _fundVault(100e18);
        _rejectAll();
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(alice);
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, ticket);
        assertFalse(vault.usedNonce(1));
    }

    function test_Withdraw_OldSignerTicketsFailAfterRotation() public {
        _fundVault(100e18);
        (address newSigner, uint256 newKey) = makeAddrAndKey("new-signer");
        bytes memory oldTicket = _ticket(signerKey, alice, address(nUSD), 1e18, 1, _deadline());

        vm.prank(owner);
        vault.setTicketSigner(newSigner);

        vm.prank(alice);
        vm.expectRevert(NoctrumVault.InvalidTicketSignature.selector);
        vault.withdrawWithTicket(address(nUSD), 1e18, oldTicket);

        bytes memory newTicket = _ticket(newKey, alice, address(nUSD), 1e18, 1, _deadline());
        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), 1e18, newTicket);
    }

    function testFuzz_Withdraw(uint128 nonce, uint256 amount, uint64 ttl) public {
        amount = bound(amount, 1, 1_000e18);
        ttl = uint64(bound(ttl, 0, 365 days));
        _fundVault(1_000e18);
        uint64 deadline = uint64(block.timestamp) + ttl;
        bytes memory ticket = _ticket(signerKey, alice, address(nUSD), amount, nonce, deadline);

        vm.prank(alice);
        vault.withdrawWithTicket(address(nUSD), amount, ticket);
        assertEq(nUSD.balanceOf(alice), amount);
        assertTrue(vault.usedNonce(nonce));
    }

    // ── Policy dry-runs ─────────────────────────────────────────

    function test_CheckDepositAllowed() public {
        vault.checkDepositAllowed(alice, address(nUSD), 1e18);

        _rejectAll();
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.checkDepositAllowed(alice, address(nUSD), 1e18);
    }

    function test_CheckWithdrawAllowed() public {
        vault.checkWithdrawAllowed(alice, address(nUSD), 1e18);

        _rejectAll();
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.checkWithdrawAllowed(alice, address(nUSD), 1e18);
    }

    function test_CheckPrivateTransferAllowed() public {
        bytes memory data = abi.encode(alice, bob, address(nUSD), 1e18);
        vm.expectCall(
            address(engine),
            abi.encodeCall(
                IPolicyEngine.check,
                (IPolicyEngine.Payload({selector: PRIVATE_TRANSFER_ACTION, sender: alice, data: data, context: ""}))
            )
        );
        vault.checkPrivateTransferAllowed(alice, bob, address(nUSD), 1e18);

        _rejectAll();
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.checkPrivateTransferAllowed(alice, bob, address(nUSD), 1e18);
    }

    function test_Checks_RevertWhenUnregistered() public {
        bytes memory err = abi.encodeWithSelector(NoctrumVault.TokenNotRegistered.selector, address(nETH));
        vm.expectRevert(err);
        vault.checkDepositAllowed(alice, address(nETH), 1e18);
        vm.expectRevert(err);
        vault.checkWithdrawAllowed(alice, address(nETH), 1e18);
        vm.expectRevert(err);
        vault.checkPrivateTransferAllowed(alice, bob, address(nETH), 1e18);
    }

    /// Engine deployed with defaultAllow = false rejects everything with no policies attached.
    function test_EngineDefaultReject() public {
        PolicyEngine strict = _deployEngine(false);
        vm.prank(alice);
        vault.register(address(nETH), address(strict));

        vm.prank(alice);
        vm.expectPartialRevert(IPolicyEngine.PolicyRunRejected.selector);
        vault.deposit(address(nETH), 1e18);
    }

    // ── Admin ───────────────────────────────────────────────────

    function test_SetTicketSigner() public {
        vm.expectEmit(address(vault));
        emit TicketSignerUpdated(signer, bob);
        vm.prank(owner);
        vault.setTicketSigner(bob);
        assertEq(vault.ticketSigner(), bob);
    }

    function test_SetTicketSigner_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setTicketSigner(bob);
    }

    function test_SetTicketSigner_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(NoctrumVault.ZeroTicketSigner.selector);
        vault.setTicketSigner(address(0));
    }
}
