// Monad Testnet. Addresses from deployments/monad-testnet.json.
export const RPC_URL = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const SERVER = process.env.SERVER_URL ?? "http://localhost:8080";
export const EXTERNAL_API = process.env.VAULT_API_URL ?? "http://localhost:8081";
export const VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
export const CHAIN_ID = 10143;

export const nUSD = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
export const nETH = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A";
export const CRE_PUBKEY = "03a62ca0efd28497d24e1cc2dc587f8e7e20ebc3de0c2315778997ead8bedda649";

// Server /internal/* routes require x-api-key when the server sets INTERNAL_API_KEY.
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

// Native MON sent to each test wallet in step 1 (D-16). approve + deposit costs ~0.021 MON.
export const GAS_FUNDING = "0.1";
