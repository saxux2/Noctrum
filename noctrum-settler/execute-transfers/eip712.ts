import type { Config } from "./main";

// ── EIP-712 domain & types for external API ─────────

export function getDomain(config: Config) {
  return {
    name: "NoctrumPrivateToken" as const,
    version: "0.0.1" as const,
    chainId: config.chainId,
    verifyingContract: config.vaultAddress as `0x${string}`,
  };
}

export const TRANSFER_TYPES = {
  "Private Token Transfer": [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;
