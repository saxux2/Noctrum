function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017/ghost",
  POOL_PRIVATE_KEY: process.env.POOL_PRIVATE_KEY ?? "",
  TOKEN_ADDRESS: required("TOKEN_ADDRESS"),
  CRE_PUBLIC_KEY: required("CRE_PUBLIC_KEY"),
  EXTERNAL_API_URL:
    process.env.EXTERNAL_API_URL ??
    "https://convergence2026-token-api.cldev.cloud",
  EXTERNAL_VAULT_ADDRESS:
    process.env.EXTERNAL_VAULT_ADDRESS ??
    "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13",
  CHAIN_ID: Number(process.env.CHAIN_ID ?? "11155111"),
  PORT: Number(process.env.PORT ?? "8080"),
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "",
  ARBITRUM_RPC_URL:
    process.env.ARBITRUM_RPC_URL ?? "https://arbitrum-one-rpc.publicnode.com",
  ETH_USD_FEED:
    process.env.ETH_USD_FEED ?? "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  GETH_ADDRESS:
    process.env.GETH_ADDRESS ?? "0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6",
};
