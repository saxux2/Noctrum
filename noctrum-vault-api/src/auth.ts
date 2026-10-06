import { ethers } from "ethers";
import { config } from "./config";
import { ApiError } from "./errors";

export const EIP712_DOMAIN = {
  name: config.EIP712_NAME,
  version: config.EIP712_VERSION,
  chainId: config.CHAIN_ID,
  verifyingContract: config.VAULT_ADDRESS as `0x${string}`,
};

// CPT request types (BACKEND §2.3). Field order is part of the type hash.
export const MESSAGE_TYPES = {
  "Retrieve Balances": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
  "List Transactions": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "cursor", type: "string" },
    { name: "limit", type: "uint256" },
  ],
  "Private Token Transfer": [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ],
  "Generate Shielded Address": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
  "Withdraw Tokens": [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

export type PrimaryType = keyof typeof MESSAGE_TYPES;

export function requireFields(body: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) {
    throw new ApiError("bad_request", `Missing required fields: ${missing.join(", ")}`);
  }
}

export function checkTimestamp(timestamp: unknown) {
  let ts: number;
  try {
    ts = Number(BigInt(timestamp as string | number));
  } catch {
    throw new ApiError("bad_request", "Invalid timestamp");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > config.AUTH_WINDOW_SECONDS) {
    throw new ApiError(
      "request_auth_expired",
      `Request timestamp outside ${config.AUTH_WINDOW_SECONDS}s window`,
    );
  }
}

/**
 * Verify an EIP-712 request signature. `signer` is the address that must have
 * signed (the `account`, or `sender` for transfers). Throws ApiError.
 */
export function authenticate(
  primaryType: PrimaryType,
  message: Record<string, unknown>,
  auth: unknown,
  signer: string,
) {
  checkTimestamp(message.timestamp);
  if (typeof auth !== "string" || !ethers.isHexString(auth)) {
    throw new ApiError("request_auth_failed", "Missing or malformed auth signature");
  }
  if (!ethers.isAddress(signer)) {
    throw new ApiError("bad_request", "Invalid account address");
  }
  const types = { [primaryType]: [...MESSAGE_TYPES[primaryType]] };
  let recovered: string;
  try {
    recovered = ethers.verifyTypedData(EIP712_DOMAIN, types, message, auth);
  } catch (err) {
    throw new ApiError(
      "request_auth_failed",
      `Invalid signature: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (recovered.toLowerCase() !== signer.toLowerCase()) {
    throw new ApiError(
      "request_auth_failed",
      `Signature mismatch: recovered ${recovered}, expected ${signer}`,
    );
  }
}
