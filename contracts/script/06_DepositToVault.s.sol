// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";

interface IVault {
    function deposit(address token, uint256 amount) external;
}

/// @title DepositToVault
/// @notice Deposits 10 tokens into the Vault contract.
///         Set TOKEN_ADDRESS env var to the ERC20 token address.
contract DepositToVault is Script {
    function run() external {
        address vault = vm.envAddress("VAULT_ADDRESS");
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        address tokenAddr = vm.envAddress("TOKEN_ADDRESS");
        uint256 amount = 10 ether; // 10 tokens (18 decimals)

        console.log("Depositor:", deployer);
        console.log("Token:", tokenAddr);
        console.log("Vault:", vault);
        console.log("Amount: 10 tokens");

        vm.startBroadcast(deployerPK);

        IVault(vault).deposit(tokenAddr, amount);

        vm.stopBroadcast();

        console.log("------------------------------------");
        console.log("Successfully deposited 10 tokens into vault");
        console.log("------------------------------------");
    }
}
