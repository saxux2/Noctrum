function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017/noctrum",
  POOL_PRIVATE_KEY: process.env.POOL_PRIVATE_KEY ?? "",
  TOKEN_ADDRESS: required("TOKEN_ADDRESS"),
  CRE_PUBLIC_KEY: required("CRE_PUBLIC_KEY"),
  EXTERNAL_API_URL:
    process.env.EXTERNAL_API_URL ?? "http://localhost:8081",
  EXTERNAL_VAULT_ADDRESS:
    process.env.EXTERNAL_VAULT_ADDRESS ??
    "0x65877F6BFd3f2D293454658BCb290b112397Eeb5",
  CHAIN_ID: Number(process.env.CHAIN_ID ?? "10143"),
  PORT: Number(process.env.PORT ?? "8080"),
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "",
  ARBITRUM_RPC_URL:
    process.env.ARBITRUM_RPC_URL ?? "https://arbitrum-one-rpc.publicnode.com",
  ETH_USD_FEED:
    process.env.ETH_USD_FEED ?? "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  NETH_ADDRESS:
    process.env.NETH_ADDRESS ?? "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A",
};
