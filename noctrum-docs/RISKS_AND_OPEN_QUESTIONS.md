# Noctrum — Risks, Unverified Values & Open Decisions

## A. Decisions you must make (blocking items marked 🔴)

| ID | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| 🔴 D-1 | **Custody on Monad.** Chainlink's CPT vault and API are Sepolia-only ❌ | A) Ask Chainlink DevRel to deploy CPT on Monad Testnet. B) Self-host a wire-compatible `NoctrumVault` + `noctrum-vault-api`. C) Keep custody on Sepolia | **B** (A is worth asking in parallel; switching later only means swapping URLs and addresses) | T1.4, T5.3 |
| 🔴 D-2 | **Rate-decryption bug.** All clients send `"0x"+hex`. settle-loans does `Buffer.from(enc,"hex")`, which gives an empty buffer, so every rate becomes **0.05** (Node 22 verified; ⚠️ VERIFY in the CRE simulator). Ghost's live matching was therefore effectively "everyone at 5%" | (a) Replicate exactly (true parity). (b) Strip an optional `0x` in `decryptRate` (one line, matches the documented intent) | Decide explicitly. (b) is what the product claims to do; (a) is what Ghost actually did | T4.1 |
| D-3 | Other carried math quirks: (i) check-loans multiplies nUSD collateral by the ETH price; (ii) borrow-intent check values nETH borrows at $1/unit; (iii) health ignores interest/repaid; (iv) liquidation 5% fee is "transferred" from the pool to the pool | Keep (parity) / fix | Keep; list fixes under Later | — |
| D-4 | ETH/USD source | Keep Arbitrum One mainnet feed (works unchanged) / switch to Monad Testnet feed `0x0c76…7818` ⚠️ | Keep Arbitrum | — |
| 🔴 D-5 | EIP-712 domain name for the vault API (and ticket) | Keep `CompliantPrivateTokenDemo` (zero client-logic change) / rename `NoctrumPrivateToken` | Rename for honesty, since it is no longer a Chainlink demo. It is only a constant change in 5 clients | T1.4, T5.3 |
| 🔴 D-6 | Token names/symbols | `nUSD`/`nETH` ("Noctrum USD/ETH") / other | nUSD / nETH | T1.3 |
| D-7 | Proposal TTL | 5 s (Ghost demo tweak, `tasks/demo-tweaks.md` §1) / 5 min (original) | 5 s for parity | — |
| D-8 | Wormhole chain list | Home = MonadTestnet; Sepolia becomes a source (8 chains) / drop Sepolia | Keep Sepolia as a source | T6.1 |
| D-9 | Domains, hosting, socials (API host, app/docs/marketing domains, Discord, Telegram bot handle, careers link, GitHub org, Raycast author) | — | You provide | T5.6, T6.4, T8.1 |
| D-10 | Contracts folder | `contracts/` / keep `transfer-demo/` | ✅ **Decided 2026-10-06: `contracts/`** | T0.2 |
| D-11 | CRE SDK version | Keep 1.1.x (parity) / upgrade to ≥ 1.19.0 | Keep unless the Monad chain is used | T4.1 |
| D-12 | Identifier renames (`ghostApiUrl`, `TOKEN_ADDRESS`, TG hard-coded addresses) | Rename per REBRAND / keep | REBRAND map | T4.1, T5.1 |
| D-13 | Ghost's **production** CRE configs are incomplete (settle and execute lack the API URL / vault fields; check-loans prod points to localhost) | Replicate / complete them | Complete them (otherwise prod deploy cannot work) | T4.1 |
| D-14 | Explorer | MonadVision / Monadscan | MonadVision (Sourcify verify) | T6.1 |
| D-15 | `next.config.ts` rewrites hard-code `http://localhost:3000` | Keep / env-driven | Env-driven (needed to deploy the web app) | T6.1 |
| D-16 | Gas thresholds and funding: TG `MIN_GAS_WEI=0.001`, e2e funding 0.005 ETH | Keep numbers / adjust for Monad (100 gwei min base fee, gas-limit charging, 10 MON reserve) | Adjust (e.g. MIN 0.05 MON, fund 1 MON) ⚠️ VERIFY by measuring. Measured 2026-10-06: a plain MON transfer costs 21000 gas at ~102 gwei ≈ 0.0022 MON; a 0.5 MON transfer from a 5 MON EOA succeeded (no reserve-balance issue) | T5.5, T7.1 |
| D-17 | Stale tests (`lend.test.ts`, `main.test.ts`) | Port broken / rewrite | Rewrite (test-only) | T5.2, T4.2 |
| D-18 | TG Dockerfile bakes `.env` into the image | Keep / runtime env | Runtime env | T5.5 |
| D-19 | Name spelling: folder `C:\Nocturm` vs product "Noctrum" | Noctrum / Nocturm | ✅ **Decided 2026-10-06: Noctrum** | T0.1 |
| D-20 | `poolAddress` exposure requires `POOL_PRIVATE_KEY` on the server | Keep / add `POOL_ADDRESS` env | Keep (parity), Later | — |

## B. Unverified values (⚠️ VERIFY before use)

| Item | Current best info | How to verify |
|---|---|---|
| ✅ CRE chain name `monad-testnet`, selector `2183018362218727504` | Verified 2026-10-06 with cre v1.37.0 (`cre-supported-chains.json`) | — |
| CRE Monad Testnet minimum versions CLI v1.30.0+, TS SDK v1.19.0+ | docs.chain.link/cre/supported-networks-ts | Re-check at build time |
| ✅ Monad Testnet forwarder address | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (cre v1.37.0); not needed (no EVM writes) | — |
| Whether `project.yaml` accepts `monad-testnet` with the old CLI | unknown | T0.3 |
| `cre workflow deploy` / secrets CLI syntax and deploy access | Ghost never documented a deploy | `cre --help`; Chainlink account |
| Monad Testnet block time / finality | docs mention 400/800 ms (testnet era) and 300/600 ms (mainnet since 2026-07) | docs.monad.xyz at build time |
| Reserve-balance semantics for plain EOAs | "Default reserve balance 10 MON" | Monad docs + a test tx |
| Monad Testnet ETH/USD feed `0x0c76859E85727683Eeba0C70Bc2e0F5781337818` | Chainlink changelog, pre-reset | docs.chain.link feed list |
| Wormhole `MonadTestnet` (id 10009), TokenBridge `0xF97B81E513f53c7a6B57Bd0b103a6c295b3096C5` | wormhole-sdk-ts main branch | Check the npm version that includes it; do a test bridge |
| Privy support for Monad Testnet with the app's wallets | — | Privy dashboard + manual test |
| WalletConnect wallets accepting `eip155:10143` as a required namespace | — | Pair MetaMask Mobile / Trust |
| ACE PolicyEngine v1.0.0 call interface used by the vault | not in the Ghost repo | Read `lib/chainlink-ace` source |
| CPT ticket typed-data struct and API timestamp window | not published | Irrelevant if D-1 = B (we define our own) |
| CPT vault `depositWithPermit` and `check*Allowed` exact signatures | names only, from the API docs | Etherscan ABI of `0xE588…2d13` on Sepolia |
| ✅ eciesjs public-key helper API | `PublicKey.toHex(true)` = compressed; verified with 0.4.17 on 2026-10-06 | — |
| viem version used inside Privy (Monad recommends ≥ 2.40.0) | — | `bun pm ls` |

## C. Risks (carried from Ghost: parity means they remain)

| Risk | Detail | Severity |
|---|---|---|
| Server trusts clients for accounting | `confirm`, `borrow-intent` and `repay` never verify that the vault deposit or private transfer happened. Anyone can create intents or "repay" without paying (the web client repays without sending funds) | High (testnet only) |
| Double payout | execute-transfers moves funds and then confirms; if confirm fails, the transfer is re-sent next cycle | High |
| Internal endpoint exposure | The web Explore page calls `/internal/pending-intents` without a key. Prod with a key breaks Explore; prod without a key exposes internal routes (liquidate, record proposals) to anyone | High |
| Float precision | Matching uses `Number(wei)` (> 2^53 precision loss for > 9007 tokens); interest uses `Number()` | Medium |
| Plaintext key storage | TG `data/wallets/*.json`, Raycast LocalStorage | Medium |
| Pool wallet custody | One EOA holds all pooled private balances | Medium |
| Single CRE ECIES key | Compromise reveals all historical bids | Medium |
| `latestAnswer` with no staleness check | Stale price → bad liquidations | Medium |
| Partial fills can create loans smaller than requested | By design | Low |
| Doc/code mismatches in Ghost | Docs say annualised interest (`× duration/365`); code is flat per loan. README says Data Streams; code uses Data Feeds. README E2E steps (`02_submit-intents.ts` …) do not exist. CLAUDE.md says "in-memory Maps"; code uses MongoDB | Low (docs) |
| Leaked Ghost secrets | Pool and test-wallet private keys are committed in `server/seed-loan.ts`, `server/scripts/*.ts` | High for Ghost; Noctrum must use new keys |

## D. New risks introduced by Noctrum

| Risk | Mitigation |
|---|---|
| The self-hosted vault-api is a new trusted party, replacing Chainlink's operator | Invariant job; open-source it; Later: move the ledger into CRE |
| The ticket-signer key controls withdrawals | Separate key, rotatable `ticketSigner`, 1 h expiry |
| The indexer can miss or double-credit deposits | `finalized` tag, idempotent (txHash, logIndex), 100-block paging |
| Monad testnet resets wipe contracts | Scripted redeploy (T3.1); addresses read from `deployments/` |
| Public RPC limits (50/20 rps) | Private RPC for vault-api and CRE |
| Wormhole testnet attestation for Monad may be slow or unsupported | Bridge is non-critical; feature-flag the tab |

## E. Later (improvement ideas; NOT part of the plan)
- Strip `0x` in decryptRate (if D-2 = a).
- Verify vault deposits and private transfers server-side before creating intents and repaying; actually collect repayment funds in the web client.
- Idempotent transfers (mark `executing` before sending, unique transfer IDs passed to the vault-api).
- A public `/pool-stats` endpoint for Explore instead of the internal route.
- Health factor using the collateral token type, accrued interest and staleness checks; annualised interest per the docs.
- BigInt matching.
- `POOL_ADDRESS` env.
- Encrypt TG and Raycast keys.
- Browser GET UIs for the vault-api (CPT parity extra).
- Implement the on-chain GhostRouter / CollateralManager / LoanLedger interfaces.
- Monad Testnet ETH/USD feed; CRE EVM writes to Monad; Monad mainnet.
