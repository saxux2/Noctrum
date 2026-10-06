---
sidebar_position: 1
title: Architecture
---

# Three Layer Architecture

NOCTRUM separates concerns across three independent trust domains. Each layer has a distinct role, distinct data access, and distinct failure modes. This separation ensures that compromising any single layer cannot break the privacy or safety guarantees of the others.

## Layer 1: Custody Layer

The custody layer is responsible for holding user funds. It has two parts: the `NoctrumVault` contract on Monad Testnet at `0x65877F6BFd3f2D293454658BCb290b112397Eeb5`, which holds the ERC20 tokens, and the Noctrum vault API (`noctrum-vault-api`), which keeps the private ledger. Together they are wire-compatible with Chainlink's Compliant Private Token (CPT) vault and API, which only exist on Ethereum Sepolia.

**Responsibilities:**
- Accept user deposits (on chain ERC20 transfers)
- Track shielded balances off chain in the vault API ledger
- Execute private transfers between shielded addresses
- Process withdrawals back to on chain balances (the vault API signs a withdrawal ticket; the user redeems it with `withdrawWithTicket`)

**Key property:** Funds can only move via user initiated actions (deposits, withdrawals) or EIP 712 signed private transfer requests from the balance owner. The NOCTRUM server cannot move funds directly.

**Tokens supported:** nUSD (synthetic USD stablecoin) and nETH (synthetic ETH) on Monad Testnet.

## Layer 2: Blind Storage Layer

The NOCTRUM API server acts as a "dumb blob store" for encrypted intents and protocol state. It is built with Hono on Bun and stores data in MongoDB.

**Responsibilities:**
- Store encrypted lend intents (cannot read the encrypted rates)
- Store borrow intents and match proposals
- Track pending transfers queued by the matching engine
- Maintain user balances, credit scores, and loan records
- Serve data to the CRE via authenticated internal endpoints

**Key property:** The server stores encrypted rate bids but possesses no decryption key. Even if the server is fully compromised, an attacker cannot learn any plaintext lending rates. The server is authenticated via `x-api-key` for internal CRE endpoints and via EIP 712 signatures for user facing endpoints.

## Layer 3: Confidential Settlement Engine

Chainlink's CRE runs the core protocol logic inside a trusted execution environment. It is the only entity that can decrypt sealed rate bids.

**Responsibilities:**
- Decrypt ECIES encrypted rate bids using the CRE private key
- Run the matching engine to pair lenders with borrowers
- Generate match proposals and submit them to the server
- Execute fund transfers by signing private transfer requests through the vault
- Monitor collateral health using Chainlink price feeds
- Trigger liquidations for undercollateralized positions

**Key property:** The CRE private key exists only within the TEE and is protected by threshold signing across the DON (Decentralized Oracle Network). Rate bids are decrypted, processed, and discarded within a single execution cycle. No plaintext rate data persists after the matching epoch completes.

## Data Flow

The typical lifecycle of a lending operation flows through all three layers:

1. **User deposits** tokens into the custody layer (on chain transaction)
2. **User private transfers** tokens to the NOCTRUM pool shielded address (vault API)
3. **Server records** the deposit slot and associates it with the user's encrypted rate bid
4. **CRE fetches** pending intents from the server via ConfidentialHTTPClient
5. **CRE decrypts** rates inside the TEE, runs matching, and posts proposals back to the server
6. **User accepts** a proposal via EIP 712 signed request to the server
7. **Server queues** a transfer for the matched principal amount
8. **CRE polls** for pending transfers, signs them with the pool wallet, and submits to the vault
9. **Vault executes** the private transfer from pool to borrower's shielded address

## Environment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/noctrum` |
| `POOL_PRIVATE_KEY` | Pool wallet private key for signing transfers | Optional (transfers are signed by CRE) |
| `TOKEN_ADDRESS` | nUSD token contract address | Required |
| `CRE_PUBLIC_KEY` | secp256k1 public key for ECIES encryption | Required |
| `EXTERNAL_API_URL` | Noctrum vault API base URL | `http://localhost:8081` |
| `EXTERNAL_VAULT_ADDRESS` | NoctrumVault contract address | `0x65877F6BFd3f2D293454658BCb290b112397Eeb5` |
| `CHAIN_ID` | Target chain ID | `10143` (Monad Testnet) |
| `PORT` | Server port | `8080` |
| `INTERNAL_API_KEY` | Authentication key for CRE internal endpoints | Empty (unauthenticated) |
| `ARBITRUM_RPC_URL` | Arbitrum RPC for price feed reads | `https://arbitrum-one-rpc.publicnode.com` |
| `ETH_USD_FEED` | Chainlink ETH/USD feed address | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` |
| `NETH_ADDRESS` | Synthetic nETH token address | `0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A` |
