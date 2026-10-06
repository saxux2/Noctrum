// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {NoctrumVault} from "../src/NoctrumVault.sol";

/// @title DeployVault
/// @notice Deploys NoctrumVault on Monad Testnet (replacement for the Sepolia-only CPT vault).
///
///         Required env vars:
///           PRIVATE_KEY           - Deployer key (becomes the vault owner)
///           TICKET_SIGNER_ADDRESS - Address of the noctrum-vault-api ticket-signing key
contract DeployVault is Script {
    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);
        address ticketSigner = vm.envAddress("TICKET_SIGNER_ADDRESS");

        console.log("Deployer:     ", deployer);
        console.log("Ticket signer:", ticketSigner);

        vm.startBroadcast(deployerPK);

        NoctrumVault vault = new NoctrumVault(deployer, ticketSigner);

        vm.stopBroadcast();

        console.log("------------------------------------");
        console.log("NoctrumVault deployed at:", address(vault));
        console.log("Set VAULT_ADDRESS to this value.");
        console.log("------------------------------------");
    }
}
