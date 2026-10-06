// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";

interface IVault {
    function register(address token, address policyEngine) external;
}

/// @title RegisterVault
/// @notice Registers an ERC20 token and its PolicyEngine on the Vault contract.
///         Set TOKEN_ADDRESS and POLICY_ENGINE_ADDRESS env vars.
contract RegisterVault is Script {
    function run() external {
        address vault = vm.envAddress("VAULT_ADDRESS");
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        address tokenAddr = vm.envAddress("TOKEN_ADDRESS");
        address policyEngineAddr = vm.envAddress("POLICY_ENGINE_ADDRESS");

        console.log("Registrar:", deployer);
        console.log("Token:", tokenAddr);
        console.log("PolicyEngine:", policyEngineAddr);
        console.log("Vault:", vault);

        vm.startBroadcast(deployerPK);

        IVault(vault).register(tokenAddr, policyEngineAddr);

        vm.stopBroadcast();

        console.log("------------------------------------");
        console.log("Successfully registered token and PolicyEngine on vault");
        console.log("------------------------------------");
    }
}
