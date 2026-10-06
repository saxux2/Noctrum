export const GHOST_SERVER_URL = "http://localhost:8080";
export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const CHAIN_ID = 11155111;
export const VAULT_ADDRESS = "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13";
export const EXTERNAL_API = "https://convergence2026-token-api.cldev.cloud";

export const gUSD = "0xD318551FbC638C4C607713A92A19FAd73eb8f743";
export const gETH = "0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6";
export const CRE_PUBKEY = "020c8353f6e6d21f3aaa5f990bac838d5eaacfaac9d255c274163b73a26afd4aa3";

export const COINS = [
  { symbol: "gUSD", name: "Ghost USD", address: gUSD },
  { symbol: "gETH", name: "Ghost ETH", address: gETH },
] as const;

export const tokenName = (addr: string | undefined) => {
  if (!addr) return "???";
  return COINS.find((c) => c.address.toLowerCase() === addr.toLowerCase())?.symbol ?? addr.slice(0, 10);
};

export const tokenIcon = (addr: string | undefined) =>
  tokenName(addr) === "gUSD" ? "gusd.png" : "geth.png";

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

export const VAULT_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdrawWithTicket(address token, uint256 amount, bytes ticket)",
];

export const GHOST_DOMAIN = {
  name: "GhostProtocol",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

export const EXTERNAL_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

// EIP-712 types for GHOST server endpoints
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

export const CANCEL_BORROW_TYPES = {
  "Cancel Borrow": [
    { name: "account", type: "address" },
    { name: "intentId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const ACCEPT_PROPOSAL_TYPES = {
  "Accept Proposal": [
    { name: "account", type: "address" },
    { name: "proposalId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const REJECT_PROPOSAL_TYPES = {
  "Reject Proposal": [
    { name: "account", type: "address" },
    { name: "proposalId", type: "string" },
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

// EIP-712 types for EXTERNAL API endpoints
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

export const BALANCE_TYPES = {
  "Retrieve Balances": [
    { name: "account", type: "address" },
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

export const SHIELDED_ADDRESS_TYPES = {
  "Generate Shielded Address": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
};

export const TRANSACTION_TYPES = {
  "List Transactions": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "cursor", type: "string" },
    { name: "limit", type: "uint256" },
  ],
};
