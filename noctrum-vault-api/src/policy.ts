import { ethers } from "ethers";
import { config } from "./config";
import { ApiError } from "./errors";

const VAULT_ABI = [
  "function checkPrivateTransferAllowed(address from, address to, address token, uint256 amount) view",
  "function checkWithdrawAllowed(address withdrawer, address token, uint256 amount) view",
  "error TokenNotRegistered(address token)",
];

export type PolicyCheck = (from: string, to: string, token: string, amount: bigint) => Promise<void>;
export type WithdrawPolicyCheck = (withdrawer: string, token: string, amount: bigint) => Promise<void>;

let provider: ethers.JsonRpcProvider | undefined;

/**
 * Dry-run the PolicyEngine through the vault (eth_call).
 * A revert means the operation is not allowed; RPC failures surface as 500.
 */
async function dryRun(fn: string, args: unknown[], token: string, what: string) {
  provider ??= new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, { staticNetwork: true });
  const vault = new ethers.Contract(config.VAULT_ADDRESS, VAULT_ABI, provider);
  try {
    await vault.getFunction(fn).staticCall(...args);
  } catch (err) {
    if (!ethers.isError(err, "CALL_EXCEPTION")) throw err;
    if (err.revert?.name === "TokenNotRegistered") {
      throw new ApiError("bad_request", `Token ${token} is not registered in the vault`);
    }
    throw new ApiError(
      "operation_denied_by_policy",
      `${what} rejected by policy${err.revert ? `: ${err.revert.name}` : ""}`,
    );
  }
}

// CPT behaviour for private transfers.
const onChainCheck: PolicyCheck = (from, to, token, amount) =>
  dryRun("checkPrivateTransferAllowed", [from, to, token, amount], token, "Private transfer");

// Before issuing a ticket, so a ticket the vault would reject never locks the balance for an hour.
const onChainWithdrawCheck: WithdrawPolicyCheck = (withdrawer, token, amount) =>
  dryRun("checkWithdrawAllowed", [withdrawer, token, amount], token, "Withdrawal");

let current: PolicyCheck = onChainCheck;
let currentWithdraw: WithdrawPolicyCheck = onChainWithdrawCheck;

export function checkPrivateTransferAllowed(from: string, to: string, token: string, amount: bigint) {
  return current(from, to, token, amount);
}

export function checkWithdrawAllowed(withdrawer: string, token: string, amount: bigint) {
  return currentWithdraw(withdrawer, token, amount);
}

/** Tests inject a fake; pass nothing to restore the on-chain check. */
export function setPolicyCheck(check?: PolicyCheck) {
  current = check ?? onChainCheck;
}

/** Tests inject a fake; pass nothing to restore the on-chain check. */
export function setWithdrawPolicyCheck(check?: WithdrawPolicyCheck) {
  currentWithdraw = check ?? onChainWithdrawCheck;
}
