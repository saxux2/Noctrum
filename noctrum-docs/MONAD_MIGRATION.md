# Noctrum — Sepolia → Monad Testnet Migration

Sources:
- [Monad testnet info](https://docs.monad.xyz/developer-essentials/testnet.md)
- [Deployment summary](https://docs.monad.xyz/developer-essentials/summary)
- [Differences](https://docs.monad.xyz/developer-essentials/differences.md)
- [RPC differences](https://docs.monad.xyz/reference/rpc-differences.md)
- [Foundry verification](https://docs.monad.xyz/guides/verify-smart-contract/foundry.md)

## 1. Network values

| Item | Sepolia (Ghost) | Monad Testnet (Noctrum) |
|---|---|---|
| Chain ID | `11155111` | `10143` |
| Native currency | ETH | MON |
| RPC | `https://ethereum-sepolia-rpc.publicnode.com` (most code), `https://1rpc.io/sepolia` (server scripts) | `https://testnet-rpc.monad.xyz` (QuickNode, 50 rps, archive). Alternates: `https://rpc.ankr.com/monad_testnet`, `https://rpc-testnet.monadinfra.com` |
| Explorer | `https://sepolia.etherscan.io` | `https://testnet.monadvision.com` or `https://testnet.monadscan.com` (D-14) |
| Faucet | — | `https://faucet.monad.xyz` |
| CRE chain name | `ethereum-testnet-sepolia` (selector 16015286601757825753) | `monad-testnet` (selector 2183018362218727504) ⚠️ VERIFY via `cre workflow supported-chains --output json` |
| Wormhole chain | `Sepolia` (10002) | `MonadTestnet` (10009) |
| viem chain | `sepolia` | `monadTestnet` |
| Canonical contracts | — | WMON `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`, Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`, Permit2 `0x000000000022d473030f116ddee9f6b43ac78ba3`, CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` (none used by Ghost) |
| Testnet reset | — | Reset from genesis on 2025-12-16. Re-deploys may be needed after future resets |

## 2. Every Sepolia-specific value in Ghost → replacement

| Value | Where (Ghost) | Replacement |
|---|---|---|
| `11155111` | `server/src/config.ts` (default), `client/src/lib/constants.ts:6`, `client/src/lib/wormhole.ts:32`, `ghost-tg/src/config.ts:22` + **hard-coded** `ghost-tg/src/constants.ts:57,64`, `ghost-raycast/src/lib/constants.ts:4`, `e2e-test/src/utils/config.ts`, `e2e-test/src/withdraw-now.ts`, `ghost-settler/execute-transfers/config.staging.json`, `server/seed-loan.ts`, `server/scripts/*.ts`, `transfer-demo/api-scripts/src/common.ts:9` | `10143` |
| Chainlink CPT vault `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` | same files as above + `transfer-demo/script/{04,05,06,07,SetupAll}` constants, README, docs | `NoctrumVault` address (after deploy) |
| CPT API `https://convergence2026-token-api.cldev.cloud` | server config default, client constants + `next.config.ts` rewrite, tg config, raycast constants, e2e config, settler config, api-scripts, server scripts | `noctrum-vault-api` URL |
| gUSD `0xD318551FbC638C4C607713A92A19FAd73eb8f743` | client, tg, raycast, e2e, server seed/scripts, docs, README | nUSD on Monad |
| gETH `0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6` | server config default `GETH_ADDRESS`, client, tg, raycast, e2e | nETH on Monad |
| Swap pool `0xF683c97a1072e4C41ae568341141b7553d40B08B` | `client/src/lib/constants.ts:139`, `ghost-tg/src/config.ts:29` | NoctrumSwapPool |
| Sepolia RPC URLs | client, tg, raycast, e2e, server scripts, settler `project.yaml` | Monad RPC |
| Etherscan link | `client/src/components/profile/ProfileHeader.tsx:120`, wormhole CHAINS | Monad explorer |
| Privy `sepolia` default chain | `client/src/components/providers/privy-provider.tsx` | `monadTestnet` |
| WalletConnect `eip155:11155111` | `ghost-tg/src/wc.ts:97,156,189,211` (via CHAIN_ID) | `eip155:10143` |
| Wormhole `dstChain: "Sepolia"` | `client/src/components/info/InfoTab.tsx:239`; `CHAINS[0]` | `"MonadTestnet"` |
| UI strings "Sepolia" | ExplorePage/FilterBar/FeaturedCard/PoolTableRow/PoolHeader/ProfileHeader/Infinity*/Footer/FAQ, tg messages, raycast README | "Monad Testnet" |
| "ETH" as gas token | tg `ensureGasBalance` messages, `/balance` | "MON" |
| Gas pre-check `0.001 ETH` | `ghost-tg/src/api.ts` `MIN_GAS_WEI` | ⚠️ D-16 (Monad min base fee 100 gwei: 1M gas limit × 100 gwei = 0.1 MON) |
| Test-wallet funding "0.005 ETH" | `e2e-test/src/01_transfer-funds.ts` | ⚠️ D-16: e.g. 0.5–1 MON per wallet (gas is charged on the limit) |
| CRE public key `020c83…aa3` | client, tg, raycast, e2e, server scripts | new Noctrum CRE key |
| EIP-712 `verifyingContract` | everywhere (= CPT vault) | NoctrumVault |
| Ghost server host `https://do.roydevelops.tech/ghost-server/api/v1` | settler configs, raycast README | ⚠️ new host (D-9) |

**Unchanged** (chain-independent): Arbitrum One RPC `https://arbitrum-one-rpc.publicnode.com`, ETH/USD feed `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`, `ethereum-mainnet-arbitrum-1`.

## 3. Monad behaviour differences and their impact on Noctrum

| Monad behaviour | Fact (source) | Impact on Noctrum | Action |
|---|---|---|---|
| **Gas charged on gas limit**, not usage | "total deducted is value + gas_price * gas_limit" (summary) | Over-set limits waste MON. Ghost never sets manual limits (ethers estimates), so it is mostly fine. Forge scripts and Wormhole SDK may set generous limits | Never hard-code high gas limits. In forge, keep estimation; consider `--gas-estimate-multiplier 110`. Fund wallets generously |
| Min base fee | "100 MON-gwei" (summary) | Tx cost floor is higher than on Sepolia. Affects `MIN_GAS_WEI` and e2e funding | D-16 |
| **Reserve balance** | "Default reserve balance [is] 10 MON" (summary). Txs that drop the balance below the reserve may revert while staying valid on-chain (differences) | Wallets holding little MON may see unexpected reverts on value-moving txs | Fund test wallets with > 10 MON where feasible, or ⚠️ VERIFY exact reserve semantics for plain EOAs |
| Block time | 400 ms / 800 ms finality on testnet (older docs); mainnet 300 ms / 600 ms since 2026-07 (summary) ⚠️ VERIFY current testnet values | `tx.wait()` returns faster. The Ghost UI has no block-time assumptions. Proposal TTL (5 s) and cron cadences are wall-clock, so unaffected | None |
| Finality / block tags | `latest` = proposed (speculative), `safe` = voted, `finalized` = irreversible (RPC diff) | vault-api deposit indexer must credit only finalized logs. `tx.wait()` (1 confirmation on `latest`) is fine for UX | Indexer uses `finalized` |
| `eth_getLogs` range | 100 blocks on QuickNode public RPC; 1,000 on Alchemy (RPC diff) | ~40 s of blocks per call; the indexer must page | `LOG_RANGE=100` |
| Historical state | `eth_call` with old block numbers may fail (RPC diff) | CRE `LAST_FINALIZED_BLOCK_NUMBER` reads go to Arbitrum, so no effect. Vault-api policy checks use `latest` | Avoid historical calls |
| Async execution / nonce | `eth_sendRawTransaction` "may not immediately reject transactions with a nonce gap or insufficient gas balance" | Multi-tx flows (approve → deposit) await each receipt, which is safe. Forge multi-tx scripts may race | `forge script --slow`. Keep `await tx.wait()` between steps |
| No global mempool | Txs forwarded to the next leaders | None | — |
| Contract size | 128 KB (vs 24 KB) | No issue | — |
| Opcodes | All opcodes as of the current fork supported. `evm_version=cancun` bytecode is valid | None | Keep cancun |
| Blob tx unsupported | type 3 not supported | Not used | — |
| EIP-7702 delegated EOAs | Cannot drop below 10 MON; CREATE banned | Only if users' wallets are delegated (e.g. smart-account wallets) | Note in FAQ |
| Per-tx gas limit | 30M; block 150M | No issue | — |
| Public RPC rate limits | 50 rps (QuickNode), 20 rps (Monad Foundation) | Client polling (10 s) + tg (15 s) + indexer are fine. Use a private RPC for the vault-api | Provider key ⚠️ |

## 4. Verification commands

```bash
# Sourcify (MonadVision)
forge verify-contract <addr> src/NoctrumVault.sol:NoctrumVault \
  --chain 10143 --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/

# Monadscan (Etherscan-style)
forge verify-contract <addr> src/NoctrumVault.sol:NoctrumVault \
  --chain 10143 --verifier etherscan --etherscan-api-key $MONADSCAN_API_KEY --watch
```
For contracts with constructor args, add `--constructor-args $(cast abi-encode "constructor(address,address)" $OWNER $SIGNER)`.
foundry.toml additions: `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`.

## 5. Polling and confirmations summary

| Loop | Ghost | Noctrum |
|---|---|---|
| CRE settle / execute / check | 30 s / 15 s / 60 s | same |
| Client notifications | 10 s | same |
| TG notifier | 15 s | same |
| Server price cache | 60 s | same |
| vault-api indexer | (Chainlink's, unknown) | 2 s poll, `finalized`, 100-block pages |
| Ticket expiry | 1 h | 1 h |
| Deposit slot TTL | 10 min | same |
| Proposal TTL | 5 s | same (D-7) |
| Loan maturity | 30 d | same |
