// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {NoctrumVault} from "../src/NoctrumVault.sol";
import {NoctrumSwapPool} from "../src/NoctrumSwapPool.sol";

/// @notice Smoke test against the live Monad Testnet deployment (TESTING §2.1).
///         Addresses come from deployments/monad-testnet.json. Skipped unless forked:
///         forge test --match-contract MonadForkTest --fork-url https://testnet-rpc.monad.xyz
contract MonadForkTest is Test {
    NoctrumVault internal vault;
    NoctrumSwapPool internal pool;
    address internal nUSD;
    address internal nETH;
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../deployments/monad-testnet.json"));
        vault = NoctrumVault(vm.parseJsonAddress(json, ".NoctrumVault"));
        // foundry.toml pins chain_id = 10143, so detect the fork by deployed code instead
        if (address(vault).code.length == 0) {
            vm.skip(true);
            return;
        }
        pool = NoctrumSwapPool(vm.parseJsonAddress(json, ".NoctrumSwapPool"));
        nUSD = vm.parseJsonAddress(json, ".nUSD");
        nETH = vm.parseJsonAddress(json, ".nETH");
    }

    function test_Fork_TicketSigner() public view {
        assertEq(vault.ticketSigner(), vm.parseJsonAddress(json, ".ticketSigner"));
        assertEq(vault.owner(), vm.parseJsonAddress(json, ".accounts.deployer"));
    }

    function test_Fork_TokensRegistered() public view {
        address deployer = vm.parseJsonAddress(json, ".accounts.deployer");
        assertEq(vault.policyEngineOf(nUSD), vm.parseJsonAddress(json, ".PolicyEngineProxy"));
        assertEq(vault.policyEngineOf(nETH), vm.parseJsonAddress(json, ".nETHPolicyEngineProxy"));
        assertEq(vault.registrarOf(nUSD), deployer);
        assertEq(vault.registrarOf(nETH), deployer);
    }

    function test_Fork_Tokens() public view {
        assertEq(IERC20Metadata(nUSD).symbol(), "nUSD");
        assertEq(IERC20Metadata(nETH).symbol(), "nETH");
        // SetupAll deposits 100 nETH into the vault
        assertGe(IERC20Metadata(nETH).balanceOf(address(vault)), 100e18);
    }

    function test_Fork_SwapPool() public view {
        assertEq(pool.tokenCount(), 2);
        assertEq(pool.getAmountOut(nETH, nUSD, 1e18), 2200e18);
    }

    function test_Fork_DepositAllowed() public view {
        vault.checkDepositAllowed(address(this), nUSD, 1e18);
    }
}
