# Noctrum Contracts

> Testnet code. It has not been audited. Do not use it in production without your own audit.

Foundry project for NOCTRUM on **Monad Testnet (chain 10143)**: the `NoctrumVault` custody contract, the `SimpleToken` ERC20 used for nUSD and nETH, and the `NoctrumSwapPool`.

`NoctrumVault` is a self-hosted replacement for Chainlink's [Compliant Private Token](https://convergence2026-token-api.cldev.cloud/) (CPT) demo vault, which only exists on Ethereum Sepolia. It keeps the CPT vault's ABI, events, withdrawal-ticket struct and [Chainlink ACE](https://chain.link/automated-compliance-engine) PolicyEngine checks. The off-chain half (private balances, private transfers, withdrawal tickets) is [`noctrum-vault-api`](../noctrum-vault-api).

Users deposit ERC20 tokens into the vault on-chain, transfer them privately off-chain through the vault API, and withdraw by redeeming a signed ticket on-chain.

## Architecture Overview

```
On-chain (Monad Testnet)                    Off-chain (noctrum-vault-api)
┌──────────────────────┐                   ┌──────────────────────────┐
│  ERC20 Token         │                   │  Private ledger API      │
│  (SimpleToken)       │                   │                          │
├──────────────────────┤   deposit event   │  /balances               │
│  NoctrumVault        │ ───────────────>  │  /private-transfer       │
│  0x65877F6B...7Eeb5  │                   │  /shielded-address       │
├──────────────────────┤   withdraw ticket │  /withdraw               │
│  PolicyEngine        │ <───────────────  │  /transactions           │
│  (Chainlink ACE)     │                   │                          │
└──────────────────────┘                   └──────────────────────────┘
```

- **NoctrumVault**: Holds deposited tokens on-chain. Enforces compliance via the token's PolicyEngine on deposit and withdraw. Redeems withdrawal tickets signed by `ticketSigner`.
- **PolicyEngine**: Chainlink ACE policy engine (ERC1967 proxy) that validates operations against configurable rules.
- **noctrum-vault-api**: Manages private balances, transfers and withdrawal tickets. Requests are authenticated with EIP-712 signatures (domain `NoctrumPrivateToken` / `0.0.1` / 10143 / NoctrumVault). It credits deposits once the `Deposit` event is finalized.
- **NoctrumSwapPool**: nUSD ⇄ nETH swaps at owner-set USD prices.

## Contracts

| File | Description |
|---|---|
| `src/NoctrumVault.sol` | CPT-compatible vault: `register`, `deposit`, `depositWithPermit`, `withdrawWithTicket`, ACE policy checks |
| `src/SimpleToken.sol` | ERC20 + ERC20Permit, owner-mintable (nUSD, nETH) |
| `src/NoctrumSwapPool.sol` | Multi-token swap pool with owner-managed prices |
| `src/interfaces/` | Production vault design interfaces (not deployed) |

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Git](https://git-scm.com/) (for `forge install`)
- A wallet with MON for gas ([faucet](https://faucet.monad.xyz))

## Setup

```bash
# Install dependencies (already done if you cloned this repo)
forge install

# Compile and test (via_ir is set in foundry.toml)
forge build
forge test -vvv

# Set environment variables
export PRIVATE_KEY=<0xyour_private_key>
export RPC_URL=https://testnet-rpc.monad.xyz
export VAULT_ADDRESS=0x65877F6BFd3f2D293454658BCb290b112397Eeb5
```

Monad charges gas on the **limit**, so keep forge's gas estimation (no large fixed `--gas-limit`) and pass `--slow` so transactions are sent one at a time.

## Foundry Scripts

| Script | What it does | Extra env |
|---|---|---|
| `00_DeployVault.s.sol:DeployVault` | Deploys NoctrumVault | `TICKET_SIGNER_ADDRESS` |
| `01_DeployToken.s.sol:DeployToken` | Deploys a SimpleToken | |
| `02_DeployPolicyEngine.s.sol:DeployPolicyEngine` | Deploys an ACE PolicyEngine behind an ERC1967 proxy | |
| `03_MintTokens.s.sol:MintTokens` | Mints 100 tokens | `TOKEN_ADDRESS`, optional `MINT_TO` |
| `04_ApproveVault.s.sol:ApproveVault` | Approves the vault to spend your tokens | `VAULT_ADDRESS`, `TOKEN_ADDRESS` |
| `05_RegisterVault.s.sol:RegisterVault` | Registers a token and its PolicyEngine on the vault | `VAULT_ADDRESS`, `TOKEN_ADDRESS`, `POLICY_ENGINE_ADDRESS` |
| `06_DepositToVault.s.sol:DepositToVault` | Deposits 10 tokens into the vault | `VAULT_ADDRESS`, `TOKEN_ADDRESS` |
| `07_WithdrawWithTicket.s.sol:WithdrawWithTicket` | Redeems a withdrawal ticket (signs with `PRIVATE_KEY_2`) | `VAULT_ADDRESS`, `TOKEN_ADDRESS`, `WITHDRAW_AMOUNT`, `TICKET` |
| `08_DeploySwapPool.s.sol:DeploySwapPool` | Deploys NoctrumSwapPool (nUSD $1, nETH $2,200) and seeds 10,000 nUSD + 10 nETH | `NUSD_ADDRESS`, `NETH_ADDRESS` |
| `SetupAll.s.sol:SetupAll` | Runs steps 01–06 in one script | `VAULT_ADDRESS` |

Run any script with:

```bash
forge script script/<File>.s.sol:<Name> --rpc-url $RPC_URL --broadcast --slow
```

### Option A: All-in-One Setup

```bash
forge script script/SetupAll.s.sol:SetupAll --rpc-url $RPC_URL --broadcast --slow
```

This will:
1. Deploy a SimpleToken (ERC20)
2. Deploy a PolicyEngine (behind an ERC1967 proxy, `defaultAllow = true`)
3. Mint 100 tokens to your address
4. Approve the vault to spend your tokens
5. Register the token and PolicyEngine on the vault
6. Deposit 10 tokens into the vault

Once the deposit block is finalized, `noctrum-vault-api` credits your private balance.

### Option B: Step-by-Step

Run scripts 01–06 from the table in order. Export `TOKEN_ADDRESS` after step 1 and `POLICY_ENGINE_ADDRESS` (the proxy) after step 2. Registration (step 5) must happen before deposits.

### Verify

```bash
forge verify-contract <addr> src/NoctrumVault.sol:NoctrumVault --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```

## Private Transactions via CLI Scripts

The TypeScript CLI scripts in `api-scripts/` sign EIP-712 requests with your private key and call `noctrum-vault-api` directly. Set `VAULT_API_URL` to the API (default `http://localhost:8081`; deployed: `https://vault-api-production-30bb.up.railway.app`).

This walkthrough uses two private keys:
- **`PRIVATE_KEY`** (Account 1 / sender): the account that deposited tokens in the on-chain setup.
- **`PRIVATE_KEY_2`** (Account 2 / receiver): a different EOA that receives a private transfer and withdraws.

### Setup

```bash
cd api-scripts
npm install

export PRIVATE_KEY=<0xaccount_1_private_key>
export PRIVATE_KEY_2=<0xaccount_2_private_key>
export VAULT_API_URL=http://localhost:8081
```

### Step 7 — Account 1: Check Balance

Should show 10 tokens after the deposit.

```bash
npx tsx src/balances.ts
```

### Step 8 — Account 2: Check Balance

Account 2 has not received any private tokens yet, so the balance is 0. `balances.ts` uses `PRIVATE_KEY`, so override it:

```bash
PRIVATE_KEY=$PRIVATE_KEY_2 npx tsx src/balances.ts
```

### Step 9 — Account 2: Generate a Shielded Address

This script uses `PRIVATE_KEY_2`.

```bash
npx tsx src/shielded-address.ts
```

**Copy the returned shielded address** for the next step.

A shielded address:
- Looks like a normal Ethereum address but cannot be linked to Account 2's real address.
- Can be shared with senders without revealing Account 2's identity.
- Is resolved by the vault API, which credits Account 2's real balance.
- Can be generated many times, so different senders cannot tell they pay the same account.

> **Privacy directions:** shielded addresses hide the **recipient** from the sender. The `hide-sender` flag hides the **sender** from the recipient's transaction history. The transfer itself is never on-chain either way.

### Step 10 — Account 1: Private Transfer to the Shielded Address

This script uses `PRIVATE_KEY` (Account 1).

```bash
npx tsx src/private-transfer.ts <shielded_address> <token_address> <amount_in_wei>

# Example: 1 token, hiding the sender
npx tsx src/private-transfer.ts 0xShieldedAddress 0xTokenAddress 1000000000000000000 hide-sender
```

The vault API enforces compliance by calling the vault's `checkPrivateTransferAllowed()` with an `eth_call`, so nothing about the transfer is exposed on-chain.

### Step 11 — Account 2: Request Withdrawal

This script uses `PRIVATE_KEY_2`.

```bash
npx tsx src/withdraw.ts <token_address> <amount_in_wei>
```

The response contains `ticket`, `amount` and `deadline`. **Copy `ticket` and `amount`.**

### Step 12 — Account 2: Redeem the Ticket On-chain

```bash
export TOKEN_ADDRESS=<your_token_address>
export WITHDRAW_AMOUNT=<amount_in_wei_from_api_response>
export TICKET=<ticket_hex_from_api_response>

forge script script/07_WithdrawWithTicket.s.sol:WithdrawWithTicket \
  --rpc-url $RPC_URL --broadcast --slow
```

Account 2 now holds the tokens in its public ERC20 balance on Monad Testnet.

> If the ticket is not redeemed within 1 hour, the vault API refunds the amount to Account 2's private balance.

### Bonus — Transaction History

```bash
npx tsx src/transactions.ts                              # Account 1, limit 10
PRIVATE_KEY=$PRIVATE_KEY_2 npx tsx src/transactions.ts   # Account 2
npx tsx src/transactions.ts 10 <cursor_from_previous_response>
```

## Complete End-to-End Flow

```
On-chain setup (SetupAll.s.sol, or scripts 01–06)
  1. Deploy ERC20 Token               (01_DeployToken.s.sol)
  2. Deploy PolicyEngine              (02_DeployPolicyEngine.s.sol)
  3. Mint 100 tokens                  (03_MintTokens.s.sol)
  4. Approve Vault                    (04_ApproveVault.s.sol)
  5. Register on Vault                (05_RegisterVault.s.sol)
  6. Deposit 10 tokens                (06_DepositToVault.s.sol)

Off-chain private transactions (api-scripts, against noctrum-vault-api)
  7. Account 1: check balance         npx tsx src/balances.ts
  8. Account 2: check balance         PRIVATE_KEY=$PRIVATE_KEY_2 npx tsx src/balances.ts
  9. Account 2: shielded address      npx tsx src/shielded-address.ts
 10. Account 1: transfer to shielded  npx tsx src/private-transfer.ts ...
 11. Account 2: request withdrawal    npx tsx src/withdraw.ts ...
 12. Account 2: redeem ticket         07_WithdrawWithTicket.s.sol
```

## Key Addresses (Monad Testnet)

| Contract | Address |
|---|---|
| NoctrumVault | `0x65877F6BFd3f2D293454658BCb290b112397Eeb5` |
| nUSD | `0x339a948f3667d222FAD43d313b3b8c3BE1415ad5` |
| nETH | `0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A` |
| PolicyEngine (nUSD, proxy) | `0x60B04476b481B10Ea26877C2cb144d6599b3d3C3` |
| PolicyEngine (nETH, proxy) | `0x1cb5Ac8d2C8d003009d62Eedd9ce06462a2D1d82` |
| NoctrumSwapPool | `0x404483376395A8F56B7e0C6Fe9B17F55d9046B71` |

Full list: [`../deployments/monad-testnet.json`](../deployments/monad-testnet.json). Explorer: [testnet.monadvision.com](https://testnet.monadvision.com).

## References

- [Chainlink CPT API documentation](https://convergence2026-token-api.cldev.cloud/docs) (the API `noctrum-vault-api` is compatible with)
- [Chainlink ACE GitHub](https://github.com/smartcontractkit/chainlink-ace)
- [Chainlink ACE Getting Started Guide](https://github.com/smartcontractkit/chainlink-ace/blob/main/getting_started/GETTING_STARTED.md)
- [Monad: verify a contract with Foundry](https://docs.monad.xyz/guides/verify-smart-contract/foundry.md)
