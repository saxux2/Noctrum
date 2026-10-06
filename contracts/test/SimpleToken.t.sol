// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {SimpleToken} from "../src/SimpleToken.sol";

contract SimpleTokenTest is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    SimpleToken internal token;
    address internal owner = makeAddr("owner");
    address internal alice;
    uint256 internal aliceKey;
    address internal bob = makeAddr("bob");

    function setUp() public {
        (alice, aliceKey) = makeAddrAndKey("alice");
        token = new SimpleToken("Noctrum USD", "nUSD", owner);
    }

    function test_Metadata() public view {
        assertEq(token.name(), "Noctrum USD");
        assertEq(token.symbol(), "nUSD");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 0);
        assertEq(token.owner(), owner);
    }

    function test_Mint_Owner() public {
        vm.prank(owner);
        token.mint(alice, 500e18);
        assertEq(token.balanceOf(alice), 500e18);
        assertEq(token.totalSupply(), 500e18);
    }

    function test_Mint_RevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1);
    }

    function _signPermit(uint256 key, address holder, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, holder, spender, value, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }

    function test_DomainSeparator_UsesTokenName() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Noctrum USD"),
                keccak256("1"),
                block.chainid,
                address(token)
            )
        );
        assertEq(token.DOMAIN_SEPARATOR(), expected);
    }

    function test_Permit_SetsAllowance() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(aliceKey, alice, bob, 100e18, 0, deadline);

        token.permit(alice, bob, 100e18, deadline, v, r, s);

        assertEq(token.allowance(alice, bob), 100e18);
        assertEq(token.nonces(alice), 1);
    }

    function test_Permit_RevertsWhenExpired() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(aliceKey, alice, bob, 100e18, 0, deadline);
        vm.warp(deadline + 1);

        vm.expectRevert(abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, deadline));
        token.permit(alice, bob, 100e18, deadline, v, r, s);
    }

    function test_Permit_RevertsOnReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(aliceKey, alice, bob, 100e18, 0, deadline);
        token.permit(alice, bob, 100e18, deadline, v, r, s);

        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        token.permit(alice, bob, 100e18, deadline, v, r, s);
    }

    function test_Permit_RevertsForWrongSigner() public {
        (, uint256 bobKey) = makeAddrAndKey("bob-key");
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(bobKey, alice, bob, 100e18, 0, deadline);

        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        token.permit(alice, bob, 100e18, deadline, v, r, s);
    }
}
