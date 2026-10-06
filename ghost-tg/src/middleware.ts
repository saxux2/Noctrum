import type { Context, NextFunction } from "grammy";
import { getWallet, hasWallet, type BotSigner } from "./wallet";

export interface WalletContext extends Context {
  wallet: BotSigner;
}

export function requireWallet(userId: number): BotSigner {
  const w = getWallet(userId);
  if (!w) throw new Error("No wallet connected. Use /wallet to set one up.");
  return w;
}
