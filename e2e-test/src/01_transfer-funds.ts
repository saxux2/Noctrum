/**
 * Step 1: Fund test wallets
 * - Mint gUSD to lenders, gETH to borrower
 * - Send gas ETH to all 3
 */
import { ethers } from "ethers";
import { deployer, lenderA, lenderB, borrower, provider } from "./utils";
import { gUSD, gETH, ERC20_ABI, MINT_ABI, toWei } from "./utils";

async function main() {
  console.log("=== Step 1: Transfer Funds ===\n");
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Lender A:  ${lenderA.address}`);
  console.log(`Lender B:  ${lenderB.address}`);
  console.log(`Borrower:  ${borrower.address}`);

  const gUSDContract = new ethers.Contract(gUSD, [...MINT_ABI, ...ERC20_ABI], deployer);
  const gETHContract = new ethers.Contract(gETH, [...MINT_ABI, ...ERC20_ABI], deployer);

  // Mint tokens
  console.log("\nMinting 500 gUSD to Lender A...");
  await (await gUSDContract.mint(lenderA.address, toWei(500))).wait();

  console.log("Minting 500 gUSD to Lender B...");
  await (await gUSDContract.mint(lenderB.address, toWei(500))).wait();

  console.log("Minting 5 gETH to Borrower...");
  await (await gETHContract.mint(borrower.address, toWei(5))).wait();

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
    const usd = await gUSDContract.balanceOf(addr);
    const eth = await gETHContract.balanceOf(addr);
    const gas = await provider.getBalance(addr);
    console.log(`  ${label.padEnd(10)} gUSD: ${ethers.formatEther(usd).padStart(10)}  gETH: ${ethers.formatEther(eth).padStart(10)}  ETH: ${ethers.formatEther(gas).padStart(10)}`);
  }

  console.log("\nDone! Run step 02 next.");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
