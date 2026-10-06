import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { RPC_URL } from "./config";
import { isWCConnected, getWCAddress, getWCSigner, disconnectWC, type WCSigner } from "./wc";

// ── Types ──

export type WalletType = "embedded" | "imported" | "connected";

// Signer that works for both ethers.Wallet and WCSigner
export type BotSigner = (ethers.Wallet | WCSigner) & {
  address: string;
  signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string>;
};

interface StoredWallet {
  type: WalletType;
  privateKey: string; // hex with 0x prefix (empty for connected wallets)
  address: string;
  createdAt: number;
}

// ── Persistence (file-based, one JSON file per user) ──

const DATA_DIR = join(import.meta.dir, "..", "data", "wallets");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function userPath(userId: number): string {
  return join(DATA_DIR, `${userId}.json`);
}

function loadUserWallet(userId: number): StoredWallet | null {
  const fp = userPath(userId);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

function saveUserWallet(userId: number, data: StoredWallet) {
  ensureDataDir();
  writeFileSync(userPath(userId), JSON.stringify(data, null, 2));
}

function deleteUserWallet(userId: number): boolean {
  const fp = userPath(userId);
  if (!existsSync(fp)) return false;
  try {
    unlinkSync(fp);
    return true;
  } catch {
    return false;
  }
}

// ── In-memory cache ──

const walletCache = new Map<number, StoredWallet>();
const provider = new ethers.JsonRpcProvider(RPC_URL);

function getStored(userId: number): StoredWallet | null {
  if (walletCache.has(userId)) return walletCache.get(userId)!;
  const stored = loadUserWallet(userId);
  if (stored) walletCache.set(userId, stored);
  return stored;
}

// ── Public API ──

export function hasWallet(userId: number): boolean {
  const stored = getStored(userId);
  if (stored) {
    // For connected wallets, verify session is still active
    if (stored.type === "connected" && !isWCConnected(userId)) {
      walletCache.delete(userId);
      deleteUserWallet(userId);
      return false;
    }
    return true;
  }
  return false;
}

export function getWalletType(userId: number): WalletType | null {
  return getStored(userId)?.type ?? null;
}

/**
 * Create a brand-new embedded wallet for the user.
 */
export function createEmbeddedWallet(userId: number): { wallet: ethers.Wallet; privateKey: string } {
  const random = ethers.Wallet.createRandom();
  const key = random.privateKey;
  const data: StoredWallet = {
    type: "embedded",
    privateKey: key,
    address: random.address,
    createdAt: Date.now(),
  };
  walletCache.set(userId, data);
  saveUserWallet(userId, data);
  return { wallet: new ethers.Wallet(key, provider), privateKey: key };
}

/**
 * Import an existing private key.
 */
export function importWallet(userId: number, privateKey: string): ethers.Wallet {
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(key, provider);
  const data: StoredWallet = {
    type: "imported",
    privateKey: key,
    address: wallet.address,
    createdAt: Date.now(),
  };
  walletCache.set(userId, data);
  saveUserWallet(userId, data);
  return wallet;
}

/**
 * Register a WalletConnect-connected wallet.
 */
export function registerConnectedWallet(userId: number, address: string) {
  const data: StoredWallet = {
    type: "connected",
    privateKey: "",
    address,
    createdAt: Date.now(),
  };
  walletCache.set(userId, data);
  saveUserWallet(userId, data);
}

/**
 * Get signer instance. Returns ethers.Wallet for embedded/imported,
 * WCSigner for connected wallets.
 */
export function getWallet(userId: number): BotSigner | null {
  const stored = getStored(userId);
  if (!stored) return null;

  if (stored.type === "connected") {
    const signer = getWCSigner(userId);
    if (!signer) {
      // Session expired
      walletCache.delete(userId);
      deleteUserWallet(userId);
      return null;
    }
    return signer as unknown as BotSigner;
  }

  return new ethers.Wallet(stored.privateKey, provider) as unknown as BotSigner;
}

export function getAddress(userId: number): string | null {
  const stored = getStored(userId);
  if (!stored) return null;
  if (stored.type === "connected") {
    return getWCAddress(userId) ?? stored.address;
  }
  return stored.address;
}

/**
 * Export the private key (only for embedded/imported wallets).
 */
export function exportPrivateKey(userId: number): string | null {
  const stored = getStored(userId);
  if (!stored || stored.type === "connected") return null;
  return stored.privateKey;
}

export function removeWallet(userId: number): boolean {
  const stored = getStored(userId);
  if (stored?.type === "connected") {
    disconnectWC(userId);
  }
  walletCache.delete(userId);
  return deleteUserWallet(userId);
}

export function getProvider(): ethers.JsonRpcProvider {
  return provider;
}
