import { ethers } from "ethers";
import { RPC_URL } from "./config";

export const provider = new ethers.JsonRpcProvider(RPC_URL);

export const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
export const pool = new ethers.Wallet(
  (process.env.POOL_PRIVATE_KEY!.startsWith("0x") ? "" : "0x") + process.env.POOL_PRIVATE_KEY!,
  provider,
);
export const lenderA = new ethers.Wallet(process.env.LENDER_A_KEY!, provider);
export const lenderB = new ethers.Wallet(process.env.LENDER_B_KEY!, provider);
export const borrower = new ethers.Wallet(process.env.BORROWER_KEY!, provider);
