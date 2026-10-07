# Noctrum — Risks, Unverified Values & Open Decisions

## A. Decisions you must make (blocking items marked 🔴)

| ID | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D-1 | **Custody on Monad.** Chainlink's CPT vault and API are Sepolia-only ❌ | A) Ask Chainlink DevRel to deploy CPT on Monad Testnet. B) Self-host a wire-compatible `NoctrumVault` + `noctrum-vault-api`. C) Keep custody on Sepolia | ✅ **Decided 2026-10-06: B** (self-hosted NoctrumVault + noctrum-vault-api) | T1.4, T5.3 |
| D-2 | **Rate-decryption bug.** All clients send `"0x"+hex`. settle-loans does `Buffer.from(enc,"hex")`, which gives an empty buffer, so every rate becomes **0.05** (Node 22 verified; with the fix, the CRE simulator decrypts real rates: blended 0.06125, T5.4). Ghost's live matching was therefore effectively "everyone at 5%" | (a) Replicate exactly (true parity). (b) Strip an optional `0x` in `decryptRate` (one line, matches the documented intent) | ✅ **Decided 2026-10-06: (b)** strip an optional `0x` in `decryptRate` | T4.1 |
| D-3 | Other carried math quirks: (i) check-loans multiplies nUSD collateral by the ETH price; (ii) borrow-intent check values nETH borrows at $1/unit; (iii) health ignores interest/repaid; (iv) liquidation 5% fee is "transferred" from the pool to the pool | Keep (parity) / fix | Keep; list fixes under Later | — |
| D-4 | ETH/USD source | Keep Arbitrum One mainnet feed (works unchanged) / switch to Monad Testnet feed `0x0c76…7818` ⚠️ | Keep Arbitrum | — |
| D-5 | EIP-712 domain name for the vault API (and ticket) | Keep `CompliantPrivateTokenDemo` (zero client-logic change) / rename `NoctrumPrivateToken` | ✅ **Decided 2026-10-06: `NoctrumPrivateToken`** | T1.4, T5.3 |
| D-6 | Token names/symbols | `nUSD`/`nETH` ("Noctrum USD/ETH") / other | ✅ **Decided 2026-10-06: nUSD / nETH ("Noctrum USD" / "Noctrum ETH")** | T1.3 |
| D-7 | Proposal TTL | 5 s (Ghost demo tweak, `tasks/demo-tweaks.md` §1) / 5 min (original) | 5 s for parity | — |
| D-8 | Wormhole chain list | Home = MonadTestnet; Sepolia becomes a source (8 chains) / drop Sepolia | Keep Sepolia as a source | T6.1 |
| D-9 | Domains, hosting, socials (API host, app/docs/marketing domains, Discord, Telegram bot handle, careers link, GitHub org, Raycast author) | — | ✅ **API hosting decided 2026-10-06 (T5.6): Railway**, platform domains `server-production-291b.up.railway.app`, `vault-api-production-30bb.up.railway.app`. App/docs/marketing domains, socials, GitHub org still open. **Raycast author decided 2026-10-07 (T6.3): `saxux2`**. **T6.4 (2026-10-07): marketing site uses placeholders, all in `frontend/src/constants/links.ts`** (`site` = `https://example.noctrum`, app/docs `*.example.noctrum`; X, Discord, Telegram, careers, Raycast repo = `#`). Still Ghost artwork, for the designer: `frontend/public/SEO-BANNER.png`, `NOCTRUM-banner.png`, `Noctrum-footer.png`, `noctrum-purple-paper.png` | T5.6, T6.4, T8.1 |
| D-10 | Contracts folder | `contracts/` / keep `transfer-demo/` | ✅ **Decided 2026-10-06: `contracts/`** | T0.2 |
| D-11 | CRE SDK version | Keep 1.1.x (parity) / upgrade to ≥ 1.19.0 | Keep unless the Monad chain is used | T4.1 |
| D-12 | Identifier renames (`ghostApiUrl`, `TOKEN_ADDRESS`, TG hard-coded addresses) | Rename per REBRAND / keep | ✅ **Applied 2026-10-06 (T4.1): REBRAND map** (`noctrumApiUrl`, namespace `noctrum-protocol`) | T4.1, T5.1 |
| D-13 | Ghost's **production** CRE configs are incomplete (settle and execute lack the API URL / vault fields; check-loans prod points to localhost) | Replicate / complete them | ✅ **Applied 2026-10-06 (T4.1): completed** with the staging values; API hosts are `*.example.noctrum` placeholders until D-9 | T4.1 |
| D-14 | Explorer | MonadVision / Monadscan | MonadVision (Sourcify verify) | T6.1 |
| D-15 | `next.config.ts` rewrites hard-code `http://localhost:3000` | Keep / env-driven | ✅ **Applied 2026-10-07 (T6.1): env-driven** (`NOCTRUM_API_ORIGIN`, `NOCTRUM_VAULT_API_URL`, default localhost:8080/8081) | T6.1 |
| D-16 | Gas thresholds and funding: TG `MIN_GAS_WEI=0.001`, e2e funding 0.005 ETH | Keep numbers / adjust for Monad (100 gwei min base fee, gas-limit charging, 10 MON reserve) | ✅ **TG applied 2026-10-06 (T5.5): `MIN_GAS_WEI` = 0.05 MON.** Measured: a plain MON transfer costs 21000 gas at ~102 gwei ≈ 0.0022 MON; a 0.5 MON transfer from a 5 MON EOA succeeded (no reserve-balance issue); the TG `/lend` flow (approve + deposit) cost ≈ 0.021 MON. **e2e applied 2026-10-07 (T7.1): 0.1 MON per wallet** (`GAS_FUNDING` in `e2e-test/src/utils/config.ts`; the borrower, the heaviest user, does 2 approve+deposit + 1 withdraw ≈ 0.06 MON) | T5.5, T7.1 |
| D-17 | Stale tests (`lend.test.ts`, `main.test.ts`) | Port broken / rewrite | ✅ **Applied 2026-10-06 (T4.2, T5.2): rewritten** (server: Mongo via `mongodb-memory-server`, price feed mocked) | T5.2, T4.2 |
| D-18 | TG Dockerfile bakes `.env` into the image | Keep / runtime env | ✅ **Applied 2026-10-06 (T5.5): runtime env** (`docker run --env-file .env`; `.env` in `.dockerignore`) | T5.5 |
| D-19 | Name spelling: folder `C:\Nocturm` vs product "Noctrum" | Noctrum / Nocturm | ✅ **Decided 2026-10-06: Noctrum** | T0.1 |
| D-20 | `poolAddress` exposure requires `POOL_PRIVATE_KEY` on the server | Keep / add `POOL_ADDRESS` env | Keep (parity), Later | — |

## B. Unverified values (⚠️ VERIFY before use)

| Item | Current best info | How to verify |
|---|---|---|
| ✅ CRE chain name `monad-testnet`, selector `2183018362218727504` | Verified 2026-10-06 with cre v1.37.0 (`cre-supported-chains.json`) | — |
| CRE Monad Testnet minimum versions CLI v1.30.0+, TS SDK v1.19.0+ | docs.chain.link/cre/supported-networks-ts | Re-check at build time |
| ✅ Monad Testnet forwarder address | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (cre v1.37.0); not needed (no EVM writes) | — |
| Whether `project.yaml` accepts `monad-testnet` with the old CLI | unknown | T0.3 |
| `cre workflow deploy` / secrets CLI syntax and deploy access | Syntax: `cre workflow deploy <dir> --target …`, `cre secrets create <yaml>` (cre v1.37.0). Org had no deploy access; **access requested 2026-10-06** via `cre account access`, awaiting Chainlink approval (blocks T5.6 CRE part) | `cre account access` shows the status |
| Monad Testnet block time / finality | docs mention 400/800 ms (testnet era) and 300/600 ms (mainnet since 2026-07) | docs.monad.xyz at build time |
| Reserve-balance semantics for plain EOAs | "Default reserve balance 10 MON" | Monad docs + a test tx |
| Monad Testnet ETH/USD feed `0x0c76859E85727683Eeba0C70Bc2e0F5781337818` | Chainlink changelog, pre-reset | docs.chain.link feed list |
| ✅ Wormhole `MonadTestnet` (id 10009), TokenBridge `0xF97B81E513f53c7a6B57Bd0b103a6c295b3096C5` | Verified 2026-10-07 in `@wormhole-foundation/sdk-base`: first in 5.0.0 (absent in 1.24.1–4.x). Client pinned to **6.1.4** (6.1.5 is a broken publish: `sdk-algorand`/`sdk-cosmwasm-core` 6.1.5 do not exist). 6.x `tokenTransfer` takes `"TokenBridge"` instead of `automatic=false` | Test bridge still pending (T7.2) |
| Privy support for Monad Testnet with the app's wallets | — | Privy dashboard + manual test |
| WalletConnect wallets accepting `eip155:10143` as a required namespace | — | Pair MetaMask Mobile / Trust |
| ✅ ACE PolicyEngine v1.0.0 call interface used by the vault | `run`/`check(Payload)`; the vault must `attach()` first. Verified from source 2026-10-06 (CONTRACTS §4) | — |
| CPT ticket typed-data struct and API timestamp window | ✅ struct `WithdrawTicket(address withdrawer,address token,uint256 amount,uint128 nonce,uint64 deadline)` from the Sourcify-verified CPT source (2026-10-06). API timestamp window still unpublished; irrelevant with D-1 = B | — |
| ✅ CPT vault `depositWithPermit` and `check*Allowed` exact signatures | Read from the Sourcify-verified source of `0xE588…2d13` (2026-10-06). `check*Allowed` return nothing and revert on rejection (CONTRACTS §3.1) | — |
| ✅ eciesjs public-key helper API | `PublicKey.toHex(true)` = compressed; verified with 0.4.17 on 2026-10-06 | — |
| viem version used inside Privy (Monad recommends ≥ 2.40.0) | — | `bun pm ls` |

## C. Risks (carried from Ghost: parity means they remain)

| Risk | Detail | Severity |
|---|---|---|
| Server trusts clients for accounting | `confirm`, `borrow-intent` and `repay` never verify that the vault deposit or private transfer happened. Anyone can create intents or "repay" without paying (the web client repays without sending funds) | High (testnet only) |
| Double payout | execute-transfers moves funds and then confirms; if confirm fails, the transfer is re-sent next cycle | High |
| Internal endpoint exposure | The web Explore page calls `/internal/pending-intents` without a key. Prod with a key breaks Explore; prod without a key exposes internal routes (liquidate, record proposals) to anyone | ✅ Resolved 2026-10-07 (`6ab41c8`): public `GET /pending-intents` (token + amount only) for Explore and TG; internal routes stay key-protected |
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
| Railway free plan: 3 services max (TG bot not hosted), Mongo volume ~434 MB. A replica-set oplog can grow to 990 MB, and the indexer writes its cursor every poll; watch `df -h /data/db` | Paid plan or Atlas before real use |
| Railway Mongo has no auth (private network only, no TCP proxy) | Keep it private; add a keyFile + users before exposing it |
| Two vault-apis on one vault. The Railway indexer credits every `Deposit`, but only debits withdrawals whose ticket it issued. Tickets from the local vault-api (T5.3 AC: 10 nUSD, tx `0x4e1141bd…`; T7.1 step 4: 800 nUSD, tx `0x2133a576…`) left the Railway ledger 810 nUSD above the vault (invariant ALERT). Fixed 2026-10-07: deployer minted 810 nUSD straight to the vault (tx `0xb2a72d4b…931c`, block 68954811, no `Deposit` event, so no ledger change); invariant clean since | Never run a local vault-api with tickets against the shared Monad vault while Railway runs: use a separate vault deploy for local tests, or point local tools at the Railway vault-api |
| Swap quote vs pool price (Ghost parity). `/swap-quote` prices nETH with Chainlink (~$2,575 on 2026-10-07); `NoctrumSwapPool` pays its fixed owner price ($2,200, `08_DeploySwapPool`). nUSD → nETH pays out more than quoted; nETH → nUSD pays ~15 % less and reverts on the 1 % minOut | Keep pool price near Chainlink with `setPrice` (owner), or quote from `getAmountOut` (Later; changes Ghost behaviour) |
| 🔴 **Unpaid repay (Ghost parity).** Web `StatusTab` Repay only signs `POST /repay`; no private transfer to the pool. `repayLoan` checks the signed amount, not that funds arrived, then credits lenders from the pool and returns collateral. A borrower keeps the loan and gets collateral back. Verified 2026-10-07 on Railway with test tokens (loan `8624fa28…`, 21.51 nUSD paid from the pool) | ✅ **Fixed 2026-10-07** (`de9d800`, merged `later/deposit-verification`, deployed to Railway): server claims a matching incoming pool transfer before lend confirm, borrow intent and repay (402 otherwise; verified live with an unfunded wallet); web Repay transfers the amount due to the pool first. e2e 6–8 send real collateral (`3360dd8`) |
| Tier progress label (Ghost parity). `ProfileHeader` thresholds 5/15 repays; server promotes to Silver after 1, so Silver shows "-40% to Gold" | Low; clamp or align thresholds (Later) |
| Public RPC limits (50/20 rps) | Private RPC for vault-api and CRE |
| Wormhole testnet attestation for Monad may be slow or unsupported | Bridge is non-critical; feature-flag the tab |

## E. Later (improvement ideas; NOT part of the plan)
- Strip `0x` in decryptRate (if D-2 = a).
- Verify vault deposits and private transfers server-side before creating intents and repaying; actually collect repayment funds in the web client. ✅ Merged 2026-10-07 (`de9d800`); e2e 6–8 updated (`3360dd8`).
- Idempotent transfers (mark `executing` before sending, unique transfer IDs passed to the vault-api).
- A public `/pool-stats` endpoint for Explore instead of the internal route.
- Health factor using the collateral token type, accrued interest and staleness checks; annualised interest per the docs.
- BigInt matching.
- `POOL_ADDRESS` env.
- Encrypt TG and Raycast keys.
- Browser GET UIs for the vault-api (CPT parity extra).
- Implement the on-chain GhostRouter / CollateralManager / LoanLedger interfaces.
- Monad Testnet ETH/USD feed; CRE EVM writes to Monad; Monad mainnet.
