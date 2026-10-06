export const RPC_URL = "https://testnet-rpc.monad.xyz";
export const SERVER =
  process.env.NEXT_PUBLIC_NOCTRUM_API_URL || "http://localhost:8080";
// noctrum-vault-api; calls go through the /external rewrite (next.config.ts)
export const EXTERNAL_API =
  process.env.NEXT_PUBLIC_NOCTRUM_VAULT_API_URL || "http://localhost:8081";
export const VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
export const CHAIN_ID = 10143;
export const EXPLORER_URL = "https://testnet.monadvision.com";

export const nUSD = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
export const nETH = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A";
export const CRE_PUBKEY =
  process.env.NEXT_PUBLIC_CRE_PUBLIC_KEY ||
  "03a62ca0efd28497d24e1cc2dc587f8e7e20ebc3de0c2315778997ead8bedda649";

// Pool address fetched from server at runtime
export let POOL_ADDRESS = "";

export async function fetchPoolAddress() {
  if (POOL_ADDRESS) return POOL_ADDRESS;
  const res = await fetch(`${SERVER}/health`);
  const data = await res.json();
  POOL_ADDRESS = data.poolAddress;
  return POOL_ADDRESS;
}

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const VAULT_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdrawWithTicket(address token, uint256 amount, bytes ticket)",
];

export const NOCTRUM_DOMAIN = {
  name: "NoctrumProtocol",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

export const EXTERNAL_DOMAIN = {
  name: "NoctrumPrivateToken",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

export const BORROW_TYPES = {
  "Submit Borrow": [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "collateralToken", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "encryptedMaxRate", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const PRIVATE_TRANSFER_TYPES = {
  "Private Token Transfer": [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const CONFIRM_DEPOSIT_TYPES = {
  "Confirm Deposit": [
    { name: "account", type: "address" },
    { name: "slotId", type: "string" },
    { name: "encryptedRate", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const CANCEL_LEND_TYPES = {
  "Cancel Lend": [
    { name: "account", type: "address" },
    { name: "slotId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const CANCEL_BORROW_TYPES = {
  "Cancel Borrow": [
    { name: "account", type: "address" },
    { name: "intentId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const REPAY_LOAN_TYPES = {
  "Repay Loan": [
    { name: "account", type: "address" },
    { name: "loanId", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const CLAIM_EXCESS_COLLATERAL_TYPES = {
  "Claim Excess Collateral": [
    { name: "account", type: "address" },
    { name: "loanId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const WITHDRAW_TYPES = {
  "Withdraw Tokens": [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const BALANCE_TYPES = {
  "Retrieve Balances": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
};

export type Coin = { symbol: string; name: string; address: string };

export const COINS: Coin[] = [
  { symbol: "nUSD", name: "Noctrum USD", address: nUSD },
  { symbol: "nETH", name: "Noctrum ETH", address: nETH },
];

// Swap Pool (deployed on Monad Testnet)
export const SWAP_POOL_ADDRESS = "0x404483376395A8F56B7e0C6Fe9B17F55d9046B71";

export const SWAP_POOL_ABI = [
  "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)",
  "function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
  "function poolBalance(address token) view returns (uint256)",
];
