// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {GhostSwapPool} from "../src/GhostSwapPool.sol";
import {SimpleToken} from "../src/SimpleToken.sol";

/// @title DeploySwapPool
/// @notice Deploys the GhostSwapPool, registers gUSD + gETH,
///         mints seed liquidity and deposits it.
///
///   env PRIVATE_KEY=0x...
///   env GUSD_ADDRESS=0xD318551FbC638C4C607713A92A19FAd73eb8f743
///   env GETH_ADDRESS=0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6
///
///   forge script script/08_DeploySwapPool.s.sol --rpc-url $RPC_URL --broadcast
contract DeploySwapPool is Script {
    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        address gUSD = vm.envAddress("GUSD_ADDRESS");
        address gETH = vm.envAddress("GETH_ADDRESS");

        console.log("Deployer:", deployer);
        console.log("gUSD:    ", gUSD);
        console.log("gETH:    ", gETH);

        vm.startBroadcast(deployerPK);

        // 1. Deploy swap pool
        GhostSwapPool pool = new GhostSwapPool(deployer);
        console.log("1) GhostSwapPool deployed at:", address(pool));

        // 2. Register tokens with USD prices (18-decimal scaled)
        //    gUSD  = $1
        //    gETH  = $2200  (owner can update with setPrice later)
        pool.addToken(gUSD, 1e18);
        pool.addToken(gETH, 2200e18);
        console.log("2) Tokens registered with initial prices");

        // 3. Mint seed liquidity to deployer
        uint256 gusdAmount = 10_000 ether; // 10 000 gUSD
        uint256 gethAmount = 10 ether;     // 10 gETH

        SimpleToken(gUSD).mint(deployer, gusdAmount);
        SimpleToken(gETH).mint(deployer, gethAmount);
        console.log("3) Minted seed tokens");

        // 4. Approve & deposit
        SimpleToken(gUSD).approve(address(pool), type(uint256).max);
        SimpleToken(gETH).approve(address(pool), type(uint256).max);
        pool.addLiquidity(gUSD, gusdAmount);
        pool.addLiquidity(gETH, gethAmount);
        console.log("4) Liquidity deposited");

        vm.stopBroadcast();

        console.log("");
        console.log("========================================");
        console.log("  SWAP POOL DEPLOYED");
        console.log("========================================");
        console.log("GhostSwapPool: ", address(pool));
        console.log("gUSD liquidity: 10,000");
        console.log("gETH liquidity: 10");
        console.log("gUSD price:     $1");
        console.log("gETH price:     $2,200");
        console.log("========================================");
    }
}
