# Noctrum Finance

**Privacy preserving peer to peer lending with sealed bid rate discovery on Chainlink CRE.**

NOCTRUM is a decentralized lending protocol where interest rates are determined through sealed bid discriminatory price auctions. Lenders submit encrypted rate bids that only the Chainlink Confidential Runtime Environment can decrypt, preventing front running and ensuring truthful price discovery. Each lender earns their individual bid rate rather than a blended pool rate, eliminating the free rider problem that plagues traditional DeFi lending.

<p align="center">
  <img width="1920" height="1080" alt="Noctrum" src="https://github.com/user-attachments/assets/bacb681a-0635-4323-b537-2ba5877aba26" />
</p>

## Architecture

NOCTRUM separates concerns across three independent trust domains:

| Layer | Role | Trust Property |
|-------|------|----------------|
| **Custody** | `NoctrumVault` on Monad Testnet + `noctrum-vault-api` private ledger (wire-compatible with Chainlink's Compliant Private Token vault) | Funds move only via user action or a signed request from the balance owner |
| **Blind Storage** | NOCTRUM API server (Hono + Bun + MongoDB) | Stores encrypted intents; cannot decrypt rates or move funds |
| **Settlement Engine** | Chainlink CRE (TEE) | Decrypts rates, runs matching, executes transfers; key material wiped after each cycle |

The server is a dumb blob store. It holds encrypted rate bids but has no decryption key. Even a fully compromised server cannot learn any plaintext lending rate or move any user funds.

## Key Mechanisms

**Sealed Bid Auctions.** Lenders encrypt their rate bids using ECIES on secp256k1 with the CRE public key. The CRE decrypts all bids inside the TEE during each 30 second matching epoch, runs the greedy fill algorithm, and discards plaintext rates after matching.

**Discriminatory Pricing.** Each lender earns their own bid rate. A lender who bids 3.5% earns 3.5% on their matched amount, regardless of what other lenders bid. This incentivizes truthful bidding and eliminates rate manipulation.

**Tick Based Rate Discovery.** Borrower demand is filled starting from the cheapest available lender tick and moving up. The borrower pays a blended rate across all matched ticks. If the blended rate exceeds their maximum, the match is rejected.

**Credit Tiers.** An endogenous credit system (Bronze through Platinum) reduces collateral requirements from 2.0x to 1.2x as borrowers build repayment history. Defaults drop the tier by one level.

**Rejection Penalty.** Borrowers who reject match proposals forfeit 5% of their collateral. This prevents option seeking behavior where borrowers use proposals as free rate discovery.

## Repository Structure

```
noctrum/
  server/               Hono API server (Bun runtime, MongoDB)
  noctrum-vault-api/    Private ledger: shielded balances, private transfers, withdrawal tickets, Monad event indexer
  noctrum-settler/
    settle-loans/       CRE matching engine (30s epoch)
    execute-transfers/  CRE fund executor (15s cycle)
    check-loans/        CRE health monitor (60s cycle)
  client/               Next.js application frontend
  frontend/             Next.js marketing site
  noctrum-tg/           Telegram bot (grammY)
  noctrum-raycast/      Raycast extension
  e2e-test/             End to end integration tests
  contracts/            Foundry smart contracts (NoctrumVault, SimpleToken, NoctrumSwapPool)
  deployments/          monad-testnet.json (deployed addresses)
  deploy/               Railway deploy scripts
  reference-docs/       Architecture documents and litepaper
  docs/                 Docusaurus documentation site
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Server | Hono |
| Database | MongoDB (Mongoose) |
| Confidential Compute | Chainlink CRE SDK |
| Encryption | eciesjs v0.4 (secp256k1 ECIES, WASM compatible) |
| Authentication | EIP 712 typed data signatures |
| Price Feeds | Chainlink ETH/USD Price Feed (Arbitrum One) |
| Chain | Monad Testnet (10143) |
| Smart Contracts | Foundry (Solidity) |
| Frontend | Next.js 16 (app), Next.js 15 (marketing), React 19, Tailwind CSS |

## Tokens

| Token | Symbol | Address (Monad Testnet) | Role |
|-------|--------|-------------------------|------|
| Noctrum USD | nUSD | `0x339a948f3667d222FAD43d313b3b8c3BE1415ad5` | Lending denomination |
| Noctrum ETH | nETH | `0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A` | Borrower collateral |

Both are ERC20 + ERC20Permit tokens deployed via the `SimpleToken` contract.

## Deployments (Monad Testnet)

Chain ID 10143 · RPC `https://testnet-rpc.monad.xyz` · Explorer [testnet.monadvision.com](https://testnet.monadvision.com) · Faucet [faucet.monad.xyz](https://faucet.monad.xyz)

| Contract | Address |
|----------|---------|
| NoctrumVault | [`0x65877F6BFd3f2D293454658BCb290b112397Eeb5`](https://testnet.monadvision.com/address/0x65877F6BFd3f2D293454658BCb290b112397Eeb5) |
| PolicyEngine (nUSD, proxy) | `0x60B04476b481B10Ea26877C2cb144d6599b3d3C3` |
| PolicyEngine (nETH, proxy) | `0x1cb5Ac8d2C8d003009d62Eedd9ce06462a2D1d82` |
| NoctrumSwapPool | `0x404483376395A8F56B7e0C6Fe9B17F55d9046B71` |
| Pool wallet | `0xc6faD39c8F8C8abaec2943e77670AeCDfe10f6C7` |

The full list (implementations, ticket signer, CRE public key, deploy block, service URLs) is in [`deployments/monad-testnet.json`](deployments/monad-testnet.json). The ETH/USD price comes from the Chainlink feed on Arbitrum One (`0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`).

### Why a self-hosted vault

Chainlink's Compliant Private Token (CPT) vault and API only exist on Ethereum Sepolia. NOCTRUM replaces them with `NoctrumVault` (same ABI, events, withdrawal-ticket struct and ACE PolicyEngine checks) and `noctrum-vault-api` (same endpoints and EIP 712 request types, domain `NoctrumPrivateToken`). Deposits are credited when the vault API indexes the finalized `Deposit` event. Withdrawals return a ticket signed by the vault's `ticketSigner`, which the user redeems on chain with `withdrawWithTicket`.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (latest)
- MongoDB 7.x+ (a replica set for `noctrum-vault-api`)
- [Foundry](https://getfoundry.sh) (contracts)
- Chainlink CRE CLI ([install guide](https://docs.chain.link/cre/getting-started/cli-installation); not on npm)

### Server

```bash
cd server
bun install
cp .env.example .env  # configure environment variables
bun run --hot src/index.ts
```

The server starts on port 8080 (configurable). Verify with `curl http://localhost:8080/health`.

### Vault API

```bash
cd noctrum-vault-api
bun install
cp .env.example .env  # set TICKET_SIGNER_PRIVATE_KEY; MongoDB must be a replica set
bun run --hot src/index.ts
```

The vault API starts on port 8081. Verify with `curl http://localhost:8081/health`.

### Contracts

```bash
cd contracts
forge build && forge test -vvv
```

### CRE Workflows

```bash
cd noctrum-settler/settle-loans && bun install
cd ../execute-transfers && bun install
cd ../check-loans && bun install
```

Simulate a workflow:

```bash
cd noctrum-settler
cre workflow simulate ./settle-loans \
  --target=staging-settings \
  --non-interactive \
  --trigger-index=0
```

Use `--target=local-settings` to point the workflows at a local server and vault API.

### E2E Tests

```bash
cd e2e-test
bun install
# .env: test wallet keys (Monad Testnet)
bun run src/01_transfer-funds.ts   # ... through src/08_collateral_tier_check.ts
```

### Documentation Site

```bash
cd docs
bun install
bun run start
```

## CRE Workflows

Three cron triggered workflows run inside the Chainlink DON:

| Workflow | Interval | What It Does |
|----------|----------|-------------|
| `settle-loans` | 30s | Expires stale proposals, fetches pending intents, decrypts rates inside TEE, runs greedy matching (cheapest lends first, largest borrows first), posts proposals to server |
| `execute-transfers` | 15s | Polls pending transfers, signs each with pool wallet via EIP 712, submits to the Noctrum vault API `/private-transfer`, confirms execution (max 3 per cycle due to 5 call budget) |
| `check-loans` | 60s | Reads ETH/USD from Chainlink feed on Arbitrum, computes health factor for each active loan, triggers liquidation for positions below 1.5x or past maturity |

## API Endpoints

### User Facing (EIP 712 authenticated)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/deposit-lend/init` | Initialize deposit slot (10 min TTL) |
| POST | `/api/v1/deposit-lend/confirm` | Confirm with encrypted rate bid |
| POST | `/api/v1/cancel-lend` | Cancel lend intent, queue fund return |
| POST | `/api/v1/borrow-intent` | Submit borrow with collateral |
| POST | `/api/v1/cancel-borrow` | Cancel borrow, return collateral |
| POST | `/api/v1/accept-proposal` | Accept match, create loan |
| POST | `/api/v1/reject-proposal` | Reject match, 5% penalty |
| POST | `/api/v1/repay` | Repay loan in full |
| GET | `/api/v1/credit-score/:address` | Query credit tier |
| GET | `/api/v1/collateral-quote` | Get collateral requirement |

### Internal (x-api-key authenticated, CRE only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/internal/pending-intents` | Fetch unmatched intents |
| POST | `/api/v1/internal/record-match-proposals` | Submit match results |
| POST | `/api/v1/internal/expire-proposals` | Auto accept timed out proposals |
| GET | `/api/v1/internal/pending-transfers` | Fetch transfer queue |
| POST | `/api/v1/internal/confirm-transfers` | Mark transfers complete |
| POST | `/api/v1/internal/liquidate-loans` | Trigger liquidation |

## Privacy Model

| Data | Server | CRE (TEE) | On Chain |
|------|--------|-----------|----------|
| Lending rates | Ciphertext only | Plaintext during matching (ephemeral) | Never visible |
| Loan amounts | Visible | Visible | Vault level only |
| Addresses | Visible | Visible | Vault level only |
| Credit scores | Visible | Visible | Not visible |
| Collateral ratios | Derivable | Visible | Not visible |

The CRE private key is split across DON nodes via threshold secret sharing. No single node can reconstruct the key or decrypt rate bids unilaterally.

## Credit Tiers

| Tier | Collateral Multiplier | Upgrade | Downgrade |
|------|----------------------|---------|-----------|
| Bronze | 2.0x | Default | N/A |
| Silver | 1.8x | Repay from Bronze | Default from Silver |
| Gold | 1.5x | Repay from Silver | Default from Gold |
| Platinum | 1.2x | Repay from Gold | Default from Platinum |

## Client Interfaces

| Interface | Stack | Entry Point |
|-----------|-------|-------------|
| Web App | Next.js 16, Privy wallet, Wormhole bridge | `client/` |
| Marketing Site | Next.js 15, Framer Motion | `frontend/` |
| Telegram Bot | grammY, WalletConnect v2 | `noctrum-tg/` |
| Raycast Extension | Raycast API, React 19 | `noctrum-raycast/` |

## Files Using Chainlink

### CRE Workflows (`@chainlink/cre-sdk`)

| File | Chainlink Usage |
|------|-----------------|
| [`noctrum-settler/settle-loans/main.ts`](noctrum-settler/settle-loans/main.ts) | CronCapability, ConfidentialHTTPClient — decrypts sealed rates, runs matching engine |
| [`noctrum-settler/check-loans/main.ts`](noctrum-settler/check-loans/main.ts) | CronCapability, EVMClient, ConfidentialHTTPClient — reads Chainlink ETH/USD price feed, liquidates unhealthy loans |
| [`noctrum-settler/execute-transfers/main.ts`](noctrum-settler/execute-transfers/main.ts) | CronCapability, ConfidentialHTTPClient — executes queued transfers via pool wallet |
| [`noctrum-settler/settle-loans/package.json`](noctrum-settler/settle-loans/package.json) | `@chainlink/cre-sdk` dependency |
| [`noctrum-settler/check-loans/package.json`](noctrum-settler/check-loans/package.json) | `@chainlink/cre-sdk` dependency |
| [`noctrum-settler/execute-transfers/package.json`](noctrum-settler/execute-transfers/package.json) | `@chainlink/cre-sdk` dependency |
| [`noctrum-settler/settle-loans/workflow.yaml`](noctrum-settler/settle-loans/workflow.yaml) | CRE workflow definition (cron trigger) |
| [`noctrum-settler/check-loans/workflow.yaml`](noctrum-settler/check-loans/workflow.yaml) | CRE workflow definition (cron trigger) |
| [`noctrum-settler/execute-transfers/workflow.yaml`](noctrum-settler/execute-transfers/workflow.yaml) | CRE workflow definition (cron trigger) |

### CRE Project Config and Secrets

| File | Chainlink Usage |
|------|-----------------|
| [`noctrum-settler/project.yaml`](noctrum-settler/project.yaml) | CRE project settings, RPC endpoints for Monad Testnet and Arbitrum |
| [`noctrum-settler/secrets.yaml`](noctrum-settler/secrets.yaml) | Vault DON secret definitions (CRE_PRIVATE_KEY, POOL_PRIVATE_KEY, INTERNAL_API_KEY) |
| [`noctrum-settler/settle-loans/config.staging.json`](noctrum-settler/settle-loans/config.staging.json) | CRE staging schedule and API URL |
| [`noctrum-settler/settle-loans/config.production.json`](noctrum-settler/settle-loans/config.production.json) | CRE production schedule |
| [`noctrum-settler/check-loans/config.staging.json`](noctrum-settler/check-loans/config.staging.json) | CRE staging schedule and API URL |
| [`noctrum-settler/check-loans/config.production.json`](noctrum-settler/check-loans/config.production.json) | CRE production schedule |
| [`noctrum-settler/execute-transfers/config.staging.json`](noctrum-settler/execute-transfers/config.staging.json) | CRE staging schedule and API URL |
| [`noctrum-settler/execute-transfers/config.production.json`](noctrum-settler/execute-transfers/config.production.json) | CRE production schedule |
| [`noctrum-settler/settle-loans/tsconfig.json`](noctrum-settler/settle-loans/tsconfig.json) | TypeScript config for CRE workflow |
| [`noctrum-settler/check-loans/tsconfig.json`](noctrum-settler/check-loans/tsconfig.json) | TypeScript config for CRE workflow |
| [`noctrum-settler/execute-transfers/tsconfig.json`](noctrum-settler/execute-transfers/tsconfig.json) | TypeScript config for CRE workflow |

### Chainlink Price Feed

| File | Chainlink Usage |
|------|-----------------|
| [`noctrum-settler/contracts/abi/PriceFeedAggregator.ts`](noctrum-settler/contracts/abi/PriceFeedAggregator.ts) | Chainlink AggregatorV3 ABI (`latestAnswer`, `decimals`) |
| [`noctrum-settler/contracts/abi/index.ts`](noctrum-settler/contracts/abi/index.ts) | Re-exports PriceFeedAggregator ABI |
| [`server/src/price.ts`](server/src/price.ts) | Reads Chainlink ETH/USD feed on Arbitrum (cached 60s) |

### Server CRE Integration

| File | Chainlink Usage |
|------|-----------------|
| [`server/src/index.ts`](server/src/index.ts) | Serves CRE public key at `GET /cre-public-key` |
| [`server/src/config.ts`](server/src/config.ts) | CRE_PUBLIC_KEY env var, Chainlink ETH/USD feed address, Arbitrum RPC |
| [`server/src/controllers/internal.controllers.ts`](server/src/controllers/internal.controllers.ts) | Internal routes called by CRE workflows (pending-intents, record-match-proposals, expire-proposals, check-loans, liquidate-loans, pending-transfers, confirm-transfers) |
| [`server/src/external-api.ts`](server/src/external-api.ts) | Calls the Noctrum vault API (private-transfer, balances, withdraw) |

### Vault and Chainlink ACE

| File | Chainlink Usage |
|------|-----------------|
| [`contracts/src/NoctrumVault.sol`](contracts/src/NoctrumVault.sol) | CPT-compatible vault; runs Chainlink ACE PolicyEngine checks on deposit, withdrawal and private transfer |
| [`contracts/script/00_DeployVault.s.sol`](contracts/script/00_DeployVault.s.sol) | Deploys NoctrumVault on Monad Testnet |
| [`contracts/script/02_DeployPolicyEngine.s.sol`](contracts/script/02_DeployPolicyEngine.s.sol) | Deploys Chainlink ACE PolicyEngine (ERC1967 proxy) |
| [`contracts/script/05_RegisterVault.s.sol`](contracts/script/05_RegisterVault.s.sol) | Registers a token and its PolicyEngine on NoctrumVault |
| [`contracts/script/SetupAll.s.sol`](contracts/script/SetupAll.s.sol) | Full deployment including PolicyEngine and vault registration |
| [`contracts/api-scripts/src/common.ts`](contracts/api-scripts/src/common.ts) | HTTP helpers for the Noctrum vault API |
| [`noctrum-vault-api/src/policy.ts`](noctrum-vault-api/src/policy.ts) | Dry-runs the vault's ACE policy checks before private transfers and withdrawals |
| [`contracts/src/interfaces/INoctrumVault.sol`](contracts/src/interfaces/INoctrumVault.sol) | Production vault interface with CRE callback integration (design target) |
| [`contracts/src/interfaces/ICRECallback.sol`](contracts/src/interfaces/ICRECallback.sol) | Interface for CRE triggered on-chain callbacks (design target) |

### Client Side Rate Encryption

| File | Chainlink Usage |
|------|-----------------|
| [`client/src/lib/constants.ts`](client/src/lib/constants.ts) | CRE public key for encrypting rates client-side (eciesjs) |
| [`client/src/lib/noctrum.ts`](client/src/lib/noctrum.ts) | Fetches CRE public key, encrypts rates before submitting |
| [`noctrum-tg/src/config.ts`](noctrum-tg/src/config.ts) | CRE public key and Noctrum vault API URL |
| [`noctrum-tg/src/api.ts`](noctrum-tg/src/api.ts) | Encrypts rates with CRE pubkey, calls the Noctrum vault API for transfers |
| [`e2e-test/src/utils/config.ts`](e2e-test/src/utils/config.ts) | CRE public key and Noctrum vault API config for tests |
| [`e2e-test/src/utils/helpers.ts`](e2e-test/src/utils/helpers.ts) | `encryptRate()` using CRE public key |

### Tests

| File | Chainlink Usage |
|------|-----------------|
| [`noctrum-settler/settle-loans/test-ecies.ts`](noctrum-settler/settle-loans/test-ecies.ts) | Tests eciesjs encryption/decryption with CRE keypair |
| [`noctrum-settler/check-loans/main.test.ts`](noctrum-settler/check-loans/main.test.ts) | Test template for liquidation workflow |
| [`noctrum-settler/execute-transfers/main.test.ts`](noctrum-settler/execute-transfers/main.test.ts) | Test template for transfer execution workflow |
| [`server/scripts/e2e-test.ts`](server/scripts/e2e-test.ts) | End to end test using CRE key and the Noctrum vault API |
| [`server/scripts/real-flow-test.ts`](server/scripts/real-flow-test.ts) | Integration test with the Noctrum vault |
| [`server/scripts/borrow-flow-test.ts`](server/scripts/borrow-flow-test.ts) | Borrow flow test with CRE encryption |
| [`e2e-test/src/02_vault_deposit_and_lend.ts`](e2e-test/src/02_vault_deposit_and_lend.ts) | Vault deposit and encrypted lend via the vault API |
| [`e2e-test/src/03_vault_deposit_and_borrow.ts`](e2e-test/src/03_vault_deposit_and_borrow.ts) | Collateral deposit and encrypted borrow via the vault API |
| [`e2e-test/src/04_check_final_loan_and_withdraw.ts`](e2e-test/src/04_check_final_loan_and_withdraw.ts) | Loan check and vault withdrawal |
| [`e2e-test/src/withdraw-now.ts`](e2e-test/src/withdraw-now.ts) | Direct vault withdrawal test |

## Documentation

Full documentation is available in the `docs/` directory (Docusaurus). Run `cd docs && bun run start` to view locally. Topics covered:

- Three layer architecture and trust model
- Tick based rate discovery and sealed bid auctions
- Matching engine algorithm and collateral system
- Incentive design (rejection penalty, credit tiers, liquidation)
- Complete API reference
- CRE workflow specifications
- Data models and transfer reasons
- Production smart contract design (NoctrumVault)
- ZK vault roadmap (Pedersen commitments, ZK circuits)

## References

- Eli, A. and Alexandre, D. (2025). "Tick-Based Lending Pools with Discriminatory Rate Matching"
- Chainlink CRE SDK Documentation
- EIP 712: Typed structured data hashing and signing
- ECIES on secp256k1 (eciesjs)

## License

Apache License 2.0
