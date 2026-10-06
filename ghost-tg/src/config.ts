import { join } from "path";
import { readFileSync, existsSync } from "fs";

// Load .env from project root (one level up from src/)
const envPath = join(import.meta.dir, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

export const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
export const GHOST_API = process.env.GHOST_API_URL || "http://localhost:8080";
export const EXTERNAL_API = process.env.EXTERNAL_API_URL || "https://convergence2026-token-api.cldev.cloud";
export const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13";
export const CHAIN_ID = Number(process.env.CHAIN_ID || "11155111");
export const BOT_TOKEN = process.env.BOT_TOKEN || "";

export const gUSD = "0xD318551FbC638C4C607713A92A19FAd73eb8f743";
export const gETH = "0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6";
export const CRE_PUBKEY = process.env.CRE_PUBLIC_KEY || "020c8353f6e6d21f3aaa5f990bac838d5eaacfaac9d255c274163b73a26afd4aa3";

export const SWAP_POOL_ADDRESS = "0xF683c97a1072e4C41ae568341141b7553d40B08B";

export const WC_PROJECT_ID = process.env.WC_PROJECT_ID || "";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN env var is required");
  process.exit(1);
}
