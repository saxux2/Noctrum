import { ethers } from "ethers";
import { config } from "./config";

export const EIP712_DOMAIN = {
  name: "GhostProtocol",
  version: "0.0.1",
  chainId: config.CHAIN_ID,
  verifyingContract: config.EXTERNAL_VAULT_ADDRESS as `0x${string}`,
};

export const MESSAGE_TYPES = {
  "Confirm Deposit": [
    { name: "account", type: "address" },
    { name: "slotId", type: "string" },
    { name: "encryptedRate", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
  "Cancel Lend": [
    { name: "account", type: "address" },
    { name: "slotId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
  "Submit Borrow": [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "collateralToken", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "encryptedMaxRate", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
  "Cancel Borrow": [
    { name: "account", type: "address" },
    { name: "intentId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
  "Accept Proposal": [
    { name: "account", type: "address" },
    { name: "proposalId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
  "Reject Proposal": [
    { name: "account", type: "address" },
    { name: "proposalId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
  "Repay Loan": [
    { name: "account", type: "address" },
    { name: "loanId", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
  "Claim Excess Collateral": [
    { name: "account", type: "address" },
    { name: "loanId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
} satisfies Record<string, ethers.TypedDataField[]>;

const FIVE_MINUTES = 5 * 60;

export function checkTimestamp(timestamp: number): void {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > FIVE_MINUTES) {
    throw new Error("Signature expired: timestamp outside 5-minute window");
  }
}

export function verifySignature(
  types: Record<string, ethers.TypedDataField[]>,
  message: Record<string, unknown>,
  signature: string
): string {
  return ethers.verifyTypedData(EIP712_DOMAIN, types, message, signature);
}

export function authenticate(
  primaryType: keyof typeof MESSAGE_TYPES,
  message: Record<string, unknown>,
  signature: string,
  expectedAccount: string
): void {
  checkTimestamp(Number(message.timestamp));

  const types: Record<string, ethers.TypedDataField[]> = {
    [primaryType]: [...MESSAGE_TYPES[primaryType]],
  };
  const recovered = verifySignature(types, message, signature);

  if (recovered.toLowerCase() !== expectedAccount.toLowerCase()) {
    throw new Error(
      `Signature mismatch: recovered ${recovered}, expected ${expectedAccount}`
    );
  }
}
