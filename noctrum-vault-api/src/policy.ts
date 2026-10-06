import { ethers } from "ethers";
import { config } from "./config";
import { ApiError } from "./errors";

const VAULT_ABI = [
  "function checkPrivateTransferAllowed(address from, address to, address token, uint256 amount) view",
  "error TokenNotRegistered(address token)",
];

export type PolicyCheck = (from: string, to: string, token: string, amount: bigint) => Promise<void>;

let provider: ethers.JsonRpcProvider | undefined;

/**
 * CPT behaviour: dry-run the PolicyEngine through the vault (eth_call).
 * A revert means the transfer is not allowed; RPC failures surface as 500.
 */
const onChainCheck: PolicyCheck = async (from, to, token, amount) => {
  provider ??= new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, { staticNetwork: true });
  const vault = new ethers.Contract(config.VAULT_ADDRESS, VAULT_ABI, provider);
  try {
    await vault.getFunction("checkPrivateTransferAllowed").staticCall(from, to, token, amount);
  } catch (err) {
    if (!ethers.isError(err, "CALL_EXCEPTION")) throw err;
    if (err.revert?.name === "TokenNotRegistered") {
      throw new ApiError("bad_request", `Token ${token} is not registered in the vault`);
    }
    throw new ApiError(
      "operation_denied_by_policy",
      `Private transfer rejected by policy${err.revert ? `: ${err.revert.name}` : ""}`,
    );
  }
};

let current: PolicyCheck = onChainCheck;

export function checkPrivateTransferAllowed(from: string, to: string, token: string, amount: bigint) {
  return current(from, to, token, amount);
}

/** Tests inject a fake; pass nothing to restore the on-chain check. */
export function setPolicyCheck(check?: PolicyCheck) {
  current = check ?? onChainCheck;
}
