export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const VAULT_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdrawWithTicket(address token, uint256 amount, bytes ticket)",
];

export const SWAP_POOL_ABI = [
  "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)",
  "function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
  "function poolBalance(address token) view returns (uint256)",
];

export const GHOST_DOMAIN = {
  name: "GhostProtocol" as const,
  version: "0.0.1" as const,
  chainId: 11155111,
  verifyingContract: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as `0x${string}`,
};

export const EXTERNAL_DOMAIN = {
  name: "CompliantPrivateTokenDemo" as const,
  version: "0.0.1" as const,
  chainId: 11155111,
  verifyingContract: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as `0x${string}`,
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
