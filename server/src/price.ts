import { ethers } from "ethers";
import { config } from "./config";

const ABI = [
  "function decimals() view returns (uint8)",
  "function latestAnswer() view returns (int256)",
];

const provider = new ethers.JsonRpcProvider(config.ARBITRUM_RPC_URL);
const feed = new ethers.Contract(config.ETH_USD_FEED, ABI, provider);

let cache: { price: number; ts: number } | null = null;
const TTL = 60_000; // 60s

export async function getEthPrice(): Promise<number> {
  if (cache && Date.now() - cache.ts < TTL) return cache.price;
  const [answer, decimals] = await Promise.all([
    feed.latestAnswer(),
    feed.decimals(),
  ]);
  const price = Number(answer) / 10 ** Number(decimals);
  cache = { price, ts: Date.now() };
  return price;
}
