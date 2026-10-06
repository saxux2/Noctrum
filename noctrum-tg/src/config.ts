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

export const RPC_URL = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
export const NOCTRUM_API = process.env.NOCTRUM_API_URL || "http://localhost:8080";
export const EXTERNAL_API = process.env.EXTERNAL_API_URL || "http://localhost:8081";
export const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
export const CHAIN_ID = Number(process.env.CHAIN_ID || "10143");
export const BOT_TOKEN = process.env.BOT_TOKEN || "";

export const nUSD = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
export const nETH = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A";
export const CRE_PUBKEY = process.env.CRE_PUBLIC_KEY || "03a62ca0efd28497d24e1cc2dc587f8e7e20ebc3de0c2315778997ead8bedda649";

export const SWAP_POOL_ADDRESS = "0x404483376395A8F56B7e0C6Fe9B17F55d9046B71";

export const WC_PROJECT_ID = process.env.WC_PROJECT_ID || "";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN env var is required");
  process.exit(1);
}
