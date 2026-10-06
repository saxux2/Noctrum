# Noctrum — Chainlink Services & External Dependencies

Legend:
- ✅ available on Monad Testnet / chain-independent
- ⚠️ verify before building
- ❌ missing, fallback required

## 1. Chainlink services

| Service / dependency | Ghost (Sepolia) value | Monad Testnet equivalent | Status |
|---|---|---|---|
| **CRE runtime / CLI** | `@chainlink/cre-cli` (npm), workflows simulate on Sepolia | Monad Testnet is listed as a CRE-supported testnet: "CLI v1.30.0+, TS SDK v1.19.0+" ([docs](https://docs.chain.link/cre/supported-networks-ts)) | ✅ (only needed if a workflow touches Monad; Ghost's workflows never touch the home chain) |
| CRE TS SDK | `@chainlink/cre-sdk` resolved 1.1.3 | Keep 1.1.x (parity), or ≥ 1.19.0 if Monad reads/writes are added | ✅ / ⚠️ D-11 |
| CRE CronCapability | 30 s / 15 s / 60 s | Same | ✅ |
| CRE ConfidentialHTTPClient + Vault DON secrets | `INTERNAL_API_KEY` (namespace `ghost-protocol`), `POOL_PRIVATE_KEY`, `CRE_PRIVATE_KEY` | Same, namespace `noctrum-protocol` | ✅ (chain-independent) ⚠️ VERIFY your CRE org has confidential-HTTP/Vault DON access |
| CRE EVMClient (read) | Arbitrum One `ethereum-mainnet-arbitrum-1` (selector 4949039107694359620) | Unchanged | ✅ |
| CRE EVM write / Keystone forwarder | Not used | Not used. Monad forwarder not required. If ever needed, get it from `cre workflow supported-chains --output json` | ✅ n/a |
| Chain name / selector for Monad Testnet | — | `monad-testnet` / `2183018362218727504` ([chain-selectors](https://github.com/smartcontractkit/chain-selectors/blob/main/selectors.yml)) | ⚠️ VERIFY with `cre workflow supported-chains --output json` |
| **Data Feed ETH/USD** | Arbitrum One `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` (`latestAnswer`, `decimals`), used by `check-loans` and `server/src/price.ts` | Keep the Arbitrum mainnet feed (chain-independent) | ✅ |
| Data Feed ETH/USD on Monad Testnet (optional) | — | Reported `0x0c76859E85727683Eeba0C70Bc2e0F5781337818` ([changelog](https://dev.chain.link/changelog/data-feeds-on-monad-testnet)) | ⚠️ VERIFY on docs.chain.link feed list after the 2025-12-16 testnet reset (D-4) |
| Data Streams | README claims "Chainlink Data Streams (ETH/USD)", but the **code uses Data Feeds only** | n/a | ✅ n/a (doc error) |
| CCIP | Not used | n/a | — |
| VRF | Not used | n/a | — |
| Automation | Not used | n/a | — |
| LINK token | Not used directly | n/a | — |
| **Chainlink ACE PolicyEngine** | `chainlink-ace` v1.0.0, deployed by scripts behind an ERC1967Proxy, defaultAllow=true | Deploy the same contract ourselves on Monad | ✅ (plain EVM code) ⚠️ VERIFY compiles/deploys unchanged |
| **Chainlink Compliant Private Token (CPT) vault** | `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` (Sepolia) | **None.** The API docs list only chainId 11155111; Monad is never mentioned ([API docs](https://convergence2026-token-api.cldev.cloud/docs)) | ❌ → implement `NoctrumVault` (CONTRACTS §3) |
| **Chainlink CPT off-chain API** | `https://convergence2026-token-api.cldev.cloud` (`/balances`, `/transactions`, `/private-transfer`, `/shielded-address`, `/withdraw`) | **None** | ❌ → implement `noctrum-vault-api` (BACKEND §2) |

Options for the CPT gap (decision **D-1**):

| Option | Description | Parity | Effort |
|---|---|---|---|
| A | Ask Chainlink DevRel (`@smartcontractkit/devrel` per CODEOWNERS) to deploy the CPT demo on Monad Testnet | Perfect | Low for us; availability unknown. It was a hackathon (Convergence 2026) demo |
| **B (recommended)** | Self-host a wire-compatible vault contract + private-ledger API (same endpoints, EIP-712 types, response JSON, 89-byte ticket) | Same UX and API; new trust point (operator runs the ledger) | Medium (~6 BUILD_PLAN tasks) |
| C | Keep custody on Sepolia (CPT) and only "brand" Noctrum | Breaks the goal "runs on Monad" | Low, but rejected |

## 2. Third-party dependencies

| Dependency | Ghost usage | Monad Testnet | Status |
|---|---|---|---|
| Monad RPC | — | `https://testnet-rpc.monad.xyz` (QuickNode, 50 rps), `https://rpc.ankr.com/monad_testnet`, `https://rpc-testnet.monadinfra.com` ([testnet docs](https://docs.monad.xyz/developer-essentials/testnet.md)) | ✅ |
| Explorer | sepolia.etherscan.io | `https://testnet.monadvision.com`, `https://testnet.monadscan.com`. viem's built-in `monadTestnet` points at `https://testnet.monadexplorer.com` | ✅ (pick one, D-14) |
| Faucet | Sepolia faucets | `https://faucet.monad.xyz` | ✅ |
| Contract verification | Etherscan | Sourcify `https://sourcify-api-monad.blockvision.org/` and Monadscan (etherscan verifier, chain 10143) | ✅ |
| **Privy** (`@privy-io/react-auth` ^3.16.0) | `defaultChain: sepolia` + 6 other testnets, login method wallet only | Use viem `monadTestnet` (id 10143) as defaultChain | ⚠️ VERIFY in the Privy dashboard that Monad Testnet is enabled for the app id and that `switchChain(10143)` works with the target wallets |
| viem/chains `monadTestnet` | — | Exported, `id: 10_143`, rpc `https://testnet-rpc.monad.xyz` ([viem source](https://github.com/wevm/viem/blob/main/src/chains/definitions/monadTestnet.ts)) | ✅. Monad recommends viem ≥ 2.40.0; Privy bundles its own viem (⚠️ VERIFY version) |
| **Wormhole TS SDK** (`@wormhole-foundation/sdk` ^1.0.0) | Bridge native tokens from 6 testnets → `Sepolia` (Wormhole chain 10002) | `MonadTestnet` (Wormhole chain id 10009), Testnet TokenBridge `0xF97B81E513f53c7a6B57Bd0b103a6c295b3096C5` ([sdk constants](https://github.com/wormhole-foundation/wormhole-sdk-ts/blob/main/core/base/src/constants/contracts/tokenBridge.ts)) | ⚠️ VERIFY the installed SDK version includes `MonadTestnet` (upgrade from 1.0.x likely needed) and that guardians attest for it on Testnet |
| WalletConnect v2 (`@walletconnect/sign-client` ^2.23.7) | `eip155:11155111` required namespace | `eip155:10143` | ⚠️ VERIFY that MetaMask/Trust/Rainbow/Phantom mobile accept Monad Testnet as a *required* chain (it may need to be `optionalNamespaces`, which would be a behaviour change) |
| MongoDB | `mongodb://localhost:27017/ghost` | `…/noctrum` | ✅ |
| eciesjs 0.4.x | Rate encryption | Same | ✅ |
| ethers 6.16 | Everywhere | Works with any EVM chain | ✅ |
| Telegram Bot API / grammY | Bot `@ghostfinancetg_bot` | New bot via @BotFather | ⚠️ needs a new token |
| Raycast | Extension `ghost` (author `snehendu_roy`) | New name `noctrum`, author `saxux2` (D-9) | ✅ |
| Hosting | API `do.roydevelops.tech/ghost-server`; sites `ghost-finance.xyz`, `app.ghost-finance.xyz`, `docs.ghost-finance.xyz`, `ghost-protocol.finance` (docs config) | ⚠️ TBD domains | ⚠️ D-9 |
| Fonts | Google Poppins (client), Geist | Same | ✅ |

## 3. Tooling versions

| Tool | Ghost | Noctrum recommended |
|---|---|---|
| Bun | latest (`oven/bun:1` Docker) | same |
| Foundry | — | ≥ 1.8.0 (Monad recommendation) |
| solc | 0.8.26 | 0.8.26 |
| CRE CLI | unspecified | ≥ 1.30.0 if `monad-testnet` is in project.yaml ⚠️ |
| Node (for Next) | 20 types | 20+/22 |
