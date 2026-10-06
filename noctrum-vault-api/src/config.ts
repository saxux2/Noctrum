// Defaults are the Monad Testnet values from deployments/monad-testnet.json.
export const config = {
  PORT: Number(process.env.PORT ?? "8081"),
  MONGODB_URI:
    process.env.MONGODB_URI ?? "mongodb://localhost:27017/noctrum-vault",
  RPC_URL: process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz",
  CHAIN_ID: Number(process.env.CHAIN_ID ?? "10143"),
  VAULT_ADDRESS:
    process.env.VAULT_ADDRESS ?? "0x65877F6BFd3f2D293454658BCb290b112397Eeb5",
  POLICY_ENGINE_ADDRESS:
    process.env.POLICY_ENGINE_ADDRESS ??
    "0x60B04476b481B10Ea26877C2cb144d6599b3d3C3",
  TICKET_SIGNER_PRIVATE_KEY: process.env.TICKET_SIGNER_PRIVATE_KEY ?? "",
  EIP712_NAME: process.env.EIP712_NAME ?? "NoctrumPrivateToken",
  EIP712_VERSION: process.env.EIP712_VERSION ?? "0.0.1",
  START_BLOCK: Number(process.env.START_BLOCK ?? "68685729"),
  LOG_RANGE: Number(process.env.LOG_RANGE ?? "100"),
  POLL_MS: Number(process.env.POLL_MS ?? "2000"),
  TICKET_TTL_SECONDS: Number(process.env.TICKET_TTL_SECONDS ?? "3600"),
  AUTH_WINDOW_SECONDS: Number(process.env.AUTH_WINDOW_SECONDS ?? "300"),
  INVARIANT_MS: Number(process.env.INVARIANT_MS ?? "60000"),
  INDEXER_ENABLED: (process.env.INDEXER_ENABLED ?? "true") !== "false",
};
