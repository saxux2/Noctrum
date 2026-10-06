// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {NoctrumSwapPool} from "../src/NoctrumSwapPool.sol";
import {SimpleToken} from "../src/SimpleToken.sol";

/// @title DeploySwapPool
/// @notice Deploys the NoctrumSwapPool, registers nUSD + nETH,
///         mints seed liquidity and deposits it.
///
///   env PRIVATE_KEY=0x...
///   env NUSD_ADDRESS=0x...
///   env NETH_ADDRESS=0x...
///
///   forge script script/08_DeploySwapPool.s.sol --rpc-url $RPC_URL --broadcast --slow
contract DeploySwapPool is Script {
    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        address nUSD = vm.envAddress("NUSD_ADDRESS");
        address nETH = vm.envAddress("NETH_ADDRESS");

        console.log("Deployer:", deployer);
        console.log("nUSD:    ", nUSD);
        console.log("nETH:    ", nETH);

        vm.startBroadcast(deployerPK);

        // 1. Deploy swap pool
        NoctrumSwapPool pool = new NoctrumSwapPool(deployer);
        console.log("1) NoctrumSwapPool deployed at:", address(pool));

        // 2. Register tokens with USD prices (18-decimal scaled)
        //    nUSD  = $1
        //    nETH  = $2200  (owner can update with setPrice later)
        pool.addToken(nUSD, 1e18);
        pool.addToken(nETH, 2200e18);
        console.log("2) Tokens registered with initial prices");

        // 3. Mint seed liquidity to deployer
        uint256 nusdAmount = 10_000 ether; // 10 000 nUSD
        uint256 nethAmount = 10 ether;     // 10 nETH

        SimpleToken(nUSD).mint(deployer, nusdAmount);
        SimpleToken(nETH).mint(deployer, nethAmount);
        console.log("3) Minted seed tokens");

        // 4. Approve & deposit
        SimpleToken(nUSD).approve(address(pool), type(uint256).max);
        SimpleToken(nETH).approve(address(pool), type(uint256).max);
        pool.addLiquidity(nUSD, nusdAmount);
        pool.addLiquidity(nETH, nethAmount);
        console.log("4) Liquidity deposited");

        vm.stopBroadcast();

        console.log("");
        console.log("========================================");
        console.log("  SWAP POOL DEPLOYED");
        console.log("========================================");
        console.log("NoctrumSwapPool: ", address(pool));
        console.log("nUSD liquidity: 10,000");
        console.log("nETH liquidity: 10");
        console.log("nUSD price:     $1");
        console.log("nETH price:     $2,200");
        console.log("========================================");
    }
}
