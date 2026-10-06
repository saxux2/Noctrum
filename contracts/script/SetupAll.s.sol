// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PolicyEngine} from "@chainlink/policy-management/core/PolicyEngine.sol";
import {SimpleToken} from "../src/SimpleToken.sol";

interface IVault {
    function register(address token, address policyEngine) external;
    function deposit(address token, uint256 amount) external;
}

/// @title SetupAll
/// @notice All-in-one script that performs the full setup:
///         1. Deploy ERC20 token
///         2. Deploy PolicyEngine (behind proxy)
///         3. Mint 100 tokens
///         4. Approve Vault
///         5. Register token + PolicyEngine on Vault
///         6. Deposit 10 tokens into Vault
contract SetupAll is Script {
    function run() external {
        address vault = vm.envAddress("VAULT_ADDRESS");
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        console.log("Deployer:", deployer);
        console.log("Vault:", vault);

        vm.startBroadcast(deployerPK);

        // 1. Deploy SimpleToken ERC20
        SimpleToken token = new SimpleToken("Noctrum ETH", "nETH", deployer);
        console.log("1) SimpleToken deployed at:", address(token));

        // 2. Deploy PolicyEngine (behind proxy)
        PolicyEngine policyEngineImpl = new PolicyEngine();
        bytes memory initData = abi.encodeWithSelector(
            PolicyEngine.initialize.selector,
            true,    // defaultAllow = true
            deployer
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(policyEngineImpl), initData);
        console.log("2) PolicyEngine impl deployed at:", address(policyEngineImpl));
        console.log("   PolicyEngine proxy deployed at:", address(proxy));

        // 3. Mint 100 tokens to deployer
        uint256 mintAmount = 1000 ether;
        token.mint(deployer, mintAmount);
        console.log("3) Minted 100 tokens to:", deployer);

        // 4. Approve Vault to spend all tokens
        token.approve(vault, type(uint256).max);
        console.log("4) Approved vault to spend tokens");

        // 5. Register token + PolicyEngine on Vault
        IVault(vault).register(address(token), address(proxy));
        console.log("5) Registered token and PolicyEngine on vault");

        // 6. Deposit 10 tokens into Vault
        uint256 depositAmount = 100 ether;
        IVault(vault).deposit(address(token), depositAmount);
        console.log("6) Deposited 10 tokens into vault");

        vm.stopBroadcast();

        console.log("");
        console.log("============================================");
        console.log("  SETUP COMPLETE");
        console.log("============================================");
        console.log("SimpleToken:        ", address(token));
        console.log("PolicyEngine proxy: ", address(proxy));
        console.log("PolicyEngine impl:  ", address(policyEngineImpl));
        console.log("Vault:              ", vault);
        console.log("Minted:              100 tokens");
        console.log("Deposited:           10 tokens");
        console.log("============================================");
        console.log("");
        console.log("You can now use the noctrum-vault-api:");
        console.log("  - Check balance:    <VAULT_API_URL>/balances");
        console.log("  - Private transfer: <VAULT_API_URL>/private-transfer");
        console.log("  - Shielded address: <VAULT_API_URL>/shielded-address");
        console.log("  - Withdraw:         <VAULT_API_URL>/withdraw");
        console.log("  - Transactions:     <VAULT_API_URL>/transactions");
    }
}
