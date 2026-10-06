# Noctrum — Build Plan

Rules:
- One task per Claude Code session.
- Each task lists dependencies (**Deps**), commands and acceptance criteria (**AC**).
- Do not start a task while any of its blocking decisions (D-x in RISKS_AND_OPEN_QUESTIONS.md) is open.
- New repo location (proposal): `C:\Nocturm\noctrum\`, built from a copy of `C:\Nocturm\ghost\`. Ghost stays untouched as the reference.
- Shell examples are bash (Git Bash on Windows).

**Blocking decisions before Phase 1:**
- D-1 (vault strategy)
- D-6 (token symbols)
- D-19 (name spelling)
- D-5 (vault EIP-712 name)
- D-2 (rate-decryption bug)

---

## Phase 0 — Setup & toolchain

### T0.1 Create the repo skeleton by copying Ghost
- **Deps:** D-19.
- **Do:**
  ```bash
  cd /c/Nocturm
  mkdir noctrum && cd noctrum && git init
  # copy without node_modules / build output / Ghost secrets
  rsync -a --exclude node_modules --exclude .next --exclude out --exclude cache \
        --exclude .cre_build_tmp.js --exclude '.env' ../ghost/ ./
  ```
  If `rsync` is not available, use `robocopy ..\ghost . /E /XD node_modules .next out cache /XF .cre_build_tmp.js .env`.
  Copy `../noctrum-docs` to `./noctrum-docs` and `noctrum-docs/CLAUDE.md` to `./CLAUDE.md`.
- **AC:** the tree matches Ghost; `git status` shows the files; no `.env` copied; first commit made.

### T0.2 Folder/file renames (structure only, no content edits)
- **Deps:** T0.1.
- **Do:** apply REBRAND §2 with `git mv`: `ghost-settler→noctrum-settler`, `ghost-tg→noctrum-tg`, `ghost-raycast→noctrum-raycast`, `transfer-demo→contracts` (D-10), plus the file renames.
- **AC:** `find . -iname '*ghost*' -not -path '*/node_modules/*' -not -path './noctrum-docs/*'` returns nothing.

### T0.3 Toolchain check
- **Do:**
  ```bash
  bun --version
  forge --version            # ≥ 1.8.0
  npm i -g @chainlink/cre-cli && cre version     # ≥ 1.30.0 if monad-testnet is in project.yaml
  cre workflow supported-chains --output json > noctrum-docs/cre-supported-chains.json
  ```
- **AC:** versions recorded in `noctrum-docs/TOOLCHAIN.md`. `monad-testnet` is present in the supported-chains JSON (closes the ⚠️ in CRE_WORKFLOWS §0).

### T0.4 Keys and accounts (operator, manual)
- **Do:**
  - Generate a new deployer, pool, ticket-signer, test wallets (lender A/B, borrower, account2) and a CRE ECIES keypair (CRE_WORKFLOWS §5).
  - Fund them from https://faucet.monad.xyz.
  - Create the Privy app (enable Monad Testnet), the WalletConnect project and the Telegram bot.
- **AC:** keys exist only in local `.env` files and the password manager; addresses recorded in `deployments/monad-testnet.json` (public parts only).

## Phase 1 — Contracts (`contracts/`)

### T1.1 Foundry config + deps
- **Deps:** T0.2.
- **Do:**
  - `cd contracts && forge install` (submodules: forge-std v1.14.0, OZ v5.5.0, OZ-upgradeable v5.5.0, chainlink-ace v1.0.0).
  - Update `foundry.toml` per CONTRACTS §0.
- **AC:** `forge build` succeeds.

### T1.2 Rebrand existing contracts
- **Do:** `GhostSwapPool → NoctrumSwapPool`; interfaces renamed; comments rebranded; logic byte-identical.
- **AC:** `forge build`; `diff` against Ghost shows identifier/comment changes only.

### T1.3 Scripts → env vault address
- **Do:**
  - Replace `address constant VAULT = 0xE588…` with `vm.envAddress("VAULT_ADDRESS")` in 04/05/06/07/SetupAll.
  - Rename tokens in 01/SetupAll/08 (`Noctrum USD`/`nUSD`, `Noctrum ETH`/`nETH`).
  - Env `NUSD_ADDRESS`/`NETH_ADDRESS`.
- **AC:** `forge build`; `grep -r 0xE588 script` is empty.

### T1.4 NoctrumVault.sol + 00_DeployVault.s.sol
- **Deps:** D-1 = B, D-5; read the chainlink-ace v1.0.0 PolicyEngine interface first (CONTRACTS §4 ⚠️).
- **Do:** implement CONTRACTS §3 exactly.
- **AC:** `forge build`; ABI contains `deposit(address,uint256)`, `withdrawWithTicket(address,uint256,bytes)`, `register(address,address)` and the 5 events with exact signatures.

## Phase 2 — Contract tests

### T2.1 Foundry unit tests
- **Deps:** T1.4.
- **Do:** TESTING §2.1 (all but the fork test).
- **AC:** `forge test -vvv` passes; `forge coverage` shows the vault fully covered on lines.

## Phase 3 — Deploy to Monad Testnet

### T3.1 Deploy and verify
- **Deps:** T2.1, T0.4.
- **Do (from `contracts/`):**
  ```bash
  source .env
  forge script script/00_DeployVault.s.sol:DeployVault --rpc-url $RPC_URL --broadcast --slow
  forge script script/02_DeployPolicyEngine.s.sol:DeployPolicyEngine --rpc-url $RPC_URL --broadcast --slow
  forge script script/01_DeployToken.s.sol:DeployToken --rpc-url $RPC_URL --broadcast --slow   # nUSD
  forge script script/SetupAll.s.sol:SetupAll --rpc-url $RPC_URL --broadcast --slow           # nETH + register + deposit (as Ghost)
  TOKEN_ADDRESS=$NUSD_ADDRESS forge script script/05_RegisterVault.s.sol:RegisterVault --rpc-url $RPC_URL --broadcast --slow
  forge script script/08_DeploySwapPool.s.sol:DeploySwapPool --rpc-url $RPC_URL --broadcast --slow
  # verify each (MONAD_MIGRATION §4)
  ```
- **AC:**
  - `deployments/monad-testnet.json` filled in.
  - All contracts verified on MonadVision.
  - `cast call $VAULT "ticketSigner()(address)"` equals the signer.
  - Fork test from TESTING §2.1 passes.

## Phase 4 — CRE workflows (`noctrum-settler/`)

### T4.1 Rebrand + config
- **Deps:** T3.1, D-12, D-13.
- **Do:**
  - `ghostApiUrl → noctrumApiUrl`; namespace `noctrum-protocol`.
  - project.yaml → monad-testnet (CRE_WORKFLOWS §0).
  - Configs per ENV_AND_CONFIG §3.
  - Apply D-2.
  - `bun install` in each workflow.
- **AC:** `bunx tsc --noEmit` passes in all 3 dirs; `cre workflow compile`/build (⚠️ VERIFY subcommand) succeeds.

### T4.2 Workflow unit tests
- **Deps:** T4.1.
- **Do:** replace the stale `main.test.ts` files (TESTING §2.2).
- **AC:** `bun test` passes in each workflow.

(Simulation against live services is T5.4.)

## Phase 5 — Backend

### T5.1 server/ rebrand + Monad config
- **Deps:** T3.1.
- **Do:**
  - BACKEND §1: domain name, defaults (DB `noctrum`, chain 10143), `GETH_ADDRESS → NETH_ADDRESS`, error strings gUSD/gETH → nUSD/nETH, `ghost.routes.ts → noctrum.routes.ts`, log line.
  - Remove the hard-coded keys from `seed-loan.ts`/`scripts/*` (env instead).
- **AC:**
  - `bun run src/index.ts` starts; `curl localhost:8080/health` returns `{"status":"ok","version":"1","poolAddress":…}`.
  - `/cre-public-key` returns the new key.

### T5.2 server tests
- **Deps:** T5.1, D-17.
- **Do:** TESTING §2.3.
- **AC:** `bun test` green.

### T5.3 noctrum-vault-api
- **Deps:** T3.1, D-1, D-5. Large task; split into T5.3a (scaffold + auth + /balances + indexer), T5.3b (/private-transfer + /shielded-address + /transactions), T5.3c (/withdraw + tickets + refund sweeper + invariant job).
- **Do:** BACKEND §2.
- **AC:**
  - TESTING §2.4 passes.
  - Manually: deposit 10 nUSD on Monad → `/balances` shows 10 within ~5 s.
  - `/withdraw` → `07_WithdrawWithTicket` succeeds on-chain.

### T5.4 CRE simulation against live services
- **Deps:** T4.2, T5.1, T5.3.
- **Do:** TESTING §3, with server + vault-api running locally (or deployed) and data seeded via e2e steps 1–3.
- **AC:** all 3 simulations return the expected strings.

### T5.5 Telegram bot (noctrum-tg)
- **Deps:** T5.1, T5.3, D-16, D-18.
- **Do:** FRONTEND §4 + BACKEND §3: rebrand, constants (chain 10143, domains, tokens, pool), WC chain, gas copy.
- **AC:** `bunx tsc --noEmit`; bot runs; `/start`, `/create_wallet`, `/price`, `/credit_score`, `/lend 1 nUSD 5` complete on Monad.

### T5.6 Deploy services
- **Deps:** T5.4, D-9.
- **Do:** Docker build/run server + vault-api + tg; HTTPS host; set `INTERNAL_API_KEY`.
- **AC:** public `/health` reachable; the Vault DON secrets are created and the workflows deployed (`cre workflow deploy …`, ⚠️ requires CRE deploy access); DON logs show the cron executions.

## Phase 6 — Frontend

### T6.1 client: constants, providers, lib
- **Deps:** T3.1, T5.1, T5.3.
- **Do:**
  - FRONTEND §1.3–1.5, 1.7.
  - Upgrade `@wormhole-foundation/sdk*` to a version containing `MonadTestnet` (⚠️ VERIFY).
  - Add `public/chains/monad.png`.
- **AC:** `bun run build` passes; Privy connects on 10143.

### T6.2 client: copy & branding
- **Deps:** T6.1, assets from the designer.
- **Do:** FRONTEND §1.6/1.8, REBRAND §1/§5/§6.
- **AC:** the REBRAND §7 grep is clean for `client/`; visual review vs Ghost screenshots.

### T6.3 Raycast extension
- **Deps:** T5.1, T5.3.
- **Do:** FRONTEND §5.
- **AC:** `bun run build` (`ray build`) passes; the 12 views work against Monad.

### T6.4 Marketing site (`frontend/`)
- **Deps:** D-9, assets.
- **Do:** FRONTEND §2.
- **AC:** `bun run build`; SEO metadata and links updated.

## Phase 7 — E2E

### T7.1 Port e2e scripts
- **Deps:** T5.6 (or local stack), T6.1.
- **Do:** config → Monad, tokens renamed, funding amounts per D-16, keys from env only.
- **AC:** TESTING §4 steps 1–8 pass on Monad Testnet with the deployed CRE workflows (or with manual simulation between steps 3 and 4).

### T7.2 Manual UI parity pass
- **Deps:** T6.2, T6.3, T5.5.
- **AC:** TESTING §5 and §6 checklists fully ticked; results saved in `noctrum-docs/PARITY_REPORT.md`.

## Phase 8 — Docs

### T8.1 Docusaurus + READMEs
- **Deps:** T7.2.
- **Do:** rebrand `docs/` (FRONTEND §3), root README (Noctrum, Monad addresses, vault-api), package READMEs, reference-docs Ghost→Noctrum.
- **AC:** `cd docs && bun run build` passes; the REBRAND §7 grep is clean repo-wide.

### T8.2 Final hygiene
- **Do:** secret scan (`git log -p | grep -E "0x[0-9a-f]{64}"`), `.env.example` per package, license (Apache-2.0 as Ghost).
- **AC:** no private keys in history; every package has a `.env.example`.

## Dependency graph (summary)
```
T0.1→T0.2→T1.1→T1.2→T1.3→T1.4→T2.1→T3.1
T0.3, T0.4 ─────────────────────────┘
T3.1→T4.1→T4.2 ─┐
T3.1→T5.1→T5.2  ├→T5.4→T5.6→T7.1→T7.2→T8.1→T8.2
T3.1→T5.3 ──────┘
T5.1,T5.3→T5.5, T6.1→T6.2, T6.3 ; T6.4 independent
```
