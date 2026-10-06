/**
 * Step 1: Fund test wallets
 * - Mint nUSD to lenders, nETH to borrower
 * - Send gas ETH to all 3
 */
import { ethers } from "ethers";
import { deployer, lenderA, lenderB, borrower, provider } from "./utils";
import { nUSD, nETH, ERC20_ABI, MINT_ABI, toWei } from "./utils";

async function main() {
  console.log("=== Step 1: Transfer Funds ===\n");
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Lender A:  ${lenderA.address}`);
  console.log(`Lender B:  ${lenderB.address}`);
  console.log(`Borrower:  ${borrower.address}`);

  const nUSDContract = new ethers.Contract(nUSD, [...MINT_ABI, ...ERC20_ABI], deployer);
  const nETHContract = new ethers.Contract(nETH, [...MINT_ABI, ...ERC20_ABI], deployer);

  // Mint tokens
  console.log("\nMinting 500 nUSD to Lender A...");
  await (await nUSDContract.mint(lenderA.address, toWei(500))).wait();

  console.log("Minting 500 nUSD to Lender B...");
  await (await nUSDContract.mint(lenderB.address, toWei(500))).wait();

  console.log("Minting 5 nETH to Borrower...");
  await (await nETHContract.mint(borrower.address, toWei(5))).wait();

  // Send gas ETH
  console.log("\nSending 0.005 ETH gas to each wallet...");
  const sends = [
    deployer.sendTransaction({ to: lenderA.address, value: ethers.parseEther("0.005") }),
    deployer.sendTransaction({ to: lenderB.address, value: ethers.parseEther("0.005") }),
    deployer.sendTransaction({ to: borrower.address, value: ethers.parseEther("0.005") }),
  ];
  const txs = await Promise.all(sends);
  await Promise.all(txs.map(tx => tx.wait()));

  // Print balances
  console.log("\n--- Balances ---");
  for (const { label, addr } of [
    { label: "Lender A", addr: lenderA.address },
    { label: "Lender B", addr: lenderB.address },
    { label: "Borrower", addr: borrower.address },
  ]) {
    const usd = await nUSDContract.balanceOf(addr);
    const eth = await nETHContract.balanceOf(addr);
    const gas = await provider.getBalance(addr);
    console.log(`  ${label.padEnd(10)} nUSD: ${ethers.formatEther(usd).padStart(10)}  nETH: ${ethers.formatEther(eth).padStart(10)}  ETH: ${ethers.formatEther(gas).padStart(10)}`);
  }

  console.log("\nDone! Run step 02 next.");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
