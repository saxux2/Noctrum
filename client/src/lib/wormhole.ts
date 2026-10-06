import {
  wormhole,
  Wormhole,
  amount as wAmount,
} from "@wormhole-foundation/sdk";
import type {
  Chain,
  TokenId,
  Signer as WHSigner,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import type { ethers } from "ethers";

let _wh: Wormhole<"Testnet"> | null = null;

export async function initWormhole(): Promise<Wormhole<"Testnet">> {
  if (_wh) return _wh;
  _wh = await wormhole("Testnet", [evm]);
  return _wh;
}

export interface ChainInfo {
  id: Chain;
  label: string;
  logo: string;
  explorer: string;
  chainId: number;
  nativeSymbol: string;
}

export const CHAINS: ChainInfo[] = [
  { id: "Sepolia", label: "Sepolia", logo: "/chains/ethereum.png", explorer: "https://sepolia.etherscan.io", chainId: 11155111, nativeSymbol: "ETH" },
  { id: "BaseSepolia", label: "Base Sepolia", logo: "/chains/base.png", explorer: "https://sepolia.basescan.org", chainId: 84532, nativeSymbol: "ETH" },
  { id: "ArbitrumSepolia", label: "Arbitrum Sepolia", logo: "/chains/arbitrum.png", explorer: "https://sepolia.arbiscan.io", chainId: 421614, nativeSymbol: "ETH" },
  { id: "OptimismSepolia", label: "OP Sepolia", logo: "/chains/optimism.png", explorer: "https://sepolia-optimism.etherscan.io", chainId: 11155420, nativeSymbol: "ETH" },
  { id: "Avalanche", label: "Avalanche Fuji", logo: "/chains/avalanche.png", explorer: "https://testnet.snowtrace.io", chainId: 43113, nativeSymbol: "AVAX" },
  { id: "Polygon", label: "Polygon Amoy", logo: "/chains/polygon.png", explorer: "https://amoy.polygonscan.com", chainId: 80002, nativeSymbol: "POL" },
  { id: "Bsc", label: "BSC Testnet", logo: "/chains/bnb.png", explorer: "https://testnet.bscscan.com", chainId: 97, nativeSymbol: "BNB" },
];

export type BridgeStatus =
  | "idle"
  | "initiating"
  | "attesting"
  | "redeeming"
  | "done"
  | "error";

async function getEvmSignerFromEthers(
  signer: ethers.Signer
): Promise<WHSigner<"Testnet">> {
  // Dynamic import to avoid bundling issues — the SDK's EVM signer
  // utilities handle gas, nonce, and tx formatting properly
  const { getEvmSignerForSigner } = await import(
    "@wormhole-foundation/sdk-evm"
  );
  return (await getEvmSignerForSigner(signer)) as WHSigner<"Testnet">;
}

export interface BridgeParams {
  srcChain: Chain;
  dstChain: Chain;
  amount: string;
  srcAddress: string;
  dstAddress: string;
}

export interface BridgeResult {
  srcTxHash?: string;
  dstTxHash?: string;
}

export async function executeBridge(
  params: BridgeParams,
  srcSigner: ethers.Signer,
  dstSigner: ethers.Signer,
  onStatus: (s: BridgeStatus) => void
): Promise<BridgeResult> {
  const wh = await initWormhole();

  const srcChain = wh.getChain(params.srcChain);
  const dstChain = wh.getChain(params.dstChain);

  const token: TokenId = Wormhole.tokenId(srcChain.chain, "native");
  const amt = wAmount.units(wAmount.parse(params.amount, 18));

  const xfer = await wh.tokenTransfer(
    token,
    amt,
    { chain: srcChain.chain, address: Wormhole.chainAddress(srcChain.chain, params.srcAddress).address },
    { chain: dstChain.chain, address: Wormhole.chainAddress(dstChain.chain, params.dstAddress).address },
    false,
  );

  // Use the SDK's native EVM signer wrapper — handles gas, nonce, tx formatting
  onStatus("initiating");
  const srcWHSigner = await getEvmSignerFromEthers(srcSigner);
  const srcTxids = await xfer.initiateTransfer(srcWHSigner);
  const srcTxHash = srcTxids[srcTxids.length - 1];

  onStatus("attesting");
  await xfer.fetchAttestation(600_000);

  onStatus("redeeming");
  const dstWHSigner = await getEvmSignerFromEthers(dstSigner);
  const dstTxids = await xfer.completeTransfer(dstWHSigner);
  const dstTxHash = dstTxids[dstTxids.length - 1];

  onStatus("done");
  return { srcTxHash, dstTxHash };
}

export function friendlyBridgeError(err: unknown): string {
  if (!(err instanceof Error)) return "Bridge failed";
  const e = err as any;
  const code = e?.code ?? e?.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return "Transaction rejected";
  if (e?.code === "INSUFFICIENT_FUNDS") return "Insufficient funds for bridge";
  const msg = e?.shortMessage ?? e?.reason ?? e?.message ?? "Bridge failed";
  if (msg.includes("missing revert data"))
    return "Transaction would revert — check your balance and try a smaller amount";
  return msg.length > 140 ? msg.slice(0, 140) + "..." : msg;
}
