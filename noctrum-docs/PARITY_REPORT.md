# Noctrum — Parity Report (T7.2)

Ghost (`../ghost/`, Sepolia) vs Noctrum (Monad Testnet 10143). Checklists from TESTING §5 and §6.

## E2E (T7.1)
✅ 2026-10-07: TESTING §4 steps 1–8 pass on Monad Testnet (local stack, manual CRE simulation). Details in TESTING §4.

## §6 Parity sign-off

Checked 2026-10-07 by diffing against Ghost with the rename normalized (Ghost/ghost/gUSD/gETH → Noctrum/noctrum/nUSD/nETH).

- [x] **All 8 EIP-712 Noctrum types byte-identical to Ghost** apart from the domain. Accept Proposal, Cancel Borrow, Cancel Lend, Claim Excess Collateral, Confirm Deposit, Reject Proposal, Repay Loan, Submit Borrow: field names, types and order are identical in server, client, tg, raycast and e2e. Domain: `NoctrumProtocol` / 0.0.1 / 10143 / NoctrumVault.
- [x] **All 5 vault-API types identical to CPT.** Retrieve Balances, List Transactions, Private Token Transfer, Generate Shielded Address and Withdraw Tokens in `noctrum-vault-api` match what Ghost's clients sign for the CPT API. Domain `NoctrumPrivateToken` (D-5).
- [x] **Endpoint list and JSON shapes identical.** The route list in `noctrum.routes.ts` matches `ghost.routes.ts`. All server controllers and `state.ts`/`price.ts` have 0 changed lines after rename normalization, so error strings differ only in token names.
- [x] **Matching output identical on the same inputs**, except D-2. `settle-loans/matching.ts` (extracted in T4.2) matches Ghost's inline `decryptRate` + `runMatchingEngine` except for the D-2 fix: strip the `0x` prefix before ECIES decryption. Ghost could not decrypt the client's `0x…` ciphertexts.
- [x] **Interest/penalty/liquidation/tier math identical.** Same controllers and `state.ts` as above, plus e2e steps 6–8 (63 / 43.2 payouts, 95/5 split, bronze ↔ silver, ×2.0 / ×1.8).
- [x] **Cron schedules identical.** Staging 30/15/60 s; production 30/30/30 s, as in Ghost.
- [x] **Timing constants.** Proposal TTL 5 s (`internal.controllers.ts`); slot TTL 10 min (`state.ts`); maturity 30 d; auth window 5 min (server `auth.ts`, vault-api `AUTH_WINDOW_SECONDS=300`); ticket 1 h (`TICKET_TTL_SECONDS=3600`).
- [x] **Polling intervals.** Client 10 s (`useNotifications.ts`); tg 15 s (`notifier.ts`).
- [x] **Every UI label/status string matches Ghost apart from the rebrand.** See the §5 line below.
- [x] **`grep -ri ghost` residuals limited to the REBRAND §7 allow-list.** Remaining matches: `client/src/components/ui/badge.tsx` (shadcn variant); root `CLAUDE.md` (names Ghost as the reference source, same role as `noctrum-docs/`); gitignored build output (`contracts/out/`); `.git` logs.
- [x] **No Sepolia references except as a Wormhole source chain (D-8).** `client/.../privy-provider.tsx` keeps sepolia/baseSepolia/arbitrumSepolia/optimismSepolia as bridge sources (D-8). Fixed in this task: `contracts/api-scripts/src/common.ts` pointed at the Sepolia CPT API (`CompliantPrivateTokenDemo`, 11155111, `0xE588…`). It now targets `noctrum-vault-api` (`VAULT_API_URL`, default `localhost:8081`), `NoctrumPrivateToken`, 10143 and NoctrumVault. Other matches are gitignored build output (`contracts/out/`, `client/tsconfig.tsbuildinfo`).

## §5 Manual UI checklist (operator)

Record date, result and any notes per line. Stack: server :8080 + vault-api :8081 locally, or Railway.

### Web (`client/`)
- [x] Connect via Privy; wallet switches to 10143
  - ✅ 2026-10-07: Privy + MetaMask (Brave) connected `0xB7fD…1a83`; all lend/borrow/swap/withdraw transactions landed on chain 10143.
- [x] Lend flow: 5 status labels appear in order; intent listed; Cancel works
  - ✅ 2026-10-07 (Brave + Claude in Chrome, client dev → Railway, wallet `0xB7fD…1a83`): 10 nUSD @ 5 % / 30 d; Expected Return 10.50000 nUSD; "Approving token spend…" shown, approve + deposit confirmed on-chain (nonce 2, wallet 1000 → 990 nUSD); "Lend intent published!" with intent id; listed as active; Cancel → "Cancelling…" → removed (server public intents back to 4). Refund waits for CRE execute-transfers (not deployed). Intermediate labels after the first were not captured (wallet pop-ups held the flow).
- [x] Borrow: quote auto-fills (×1.02 buffer); tier/ratio/ETH price rows; submit; listed; cancel
  - ✅ 2026-10-07 (Brave, wallet `0xB7fD…1a83`): 20 nUSD → collateral auto-filled 0.01583 nETH (= 20 × 2 / $2578.09 × 1.02); rows bronze / 2x / ETH price. Submit: approve + collateral deposit on-chain (wallet 0.04545 → 0.02961 nETH), "Private transferring collateral to pool…", "Borrow intent submitted!", listed "20 nUSD · Collateral 0.01584 nETH · pending"; Cancel → "Cancelling…" → removed (server borrowIntents []). First attempt showed "Transaction rejected": MetaMask's content script logged "Extension context invalidated" (extension restarted mid-flow); page reload fixed it, not an app issue (same 4001 mapping as Ghost).
- [x] Swap: quote and rate label; 1% slippage; tx hash shown; notification
  - ✅ 2026-10-07: 100 nUSD → quote 0.03882757 nETH, rate label, "ETH/USD: $2575.49 (Chainlink)"; "Approving nUSD…" → "Swap successful!" with MonadVision tx link `0xf9149e3c…`; balance 990 → 890 nUSD; "Swap Complete" notification. minOut = quote × 99 %.
  - ⚠️ Parity, not a regression: the quote uses the Chainlink price but `NoctrumSwapPool` pays at its fixed owner price ($2,200 from `08_DeploySwapPool`, as Ghost), so the wallet got 0.04545 nETH, not the quoted 0.03883. nETH → nUSD will receive ~15 % less than quoted and revert on the 1 % minOut. See RISKS.
- [~] Bridge: Sepolia/Base Sepolia → Monad Testnet completes (attest ≤ 10 min); first test of Wormhole `MonadTestnet` (6.1.4)
  - ⏭️ Skipped 2026-10-07 by the user: not needed for the core app. Wormhole 6.1.4 `tokenTransfer` path compiles but is still unexercised; test before advertising bridging.
- [x] Status: repay, claim excess, cancel
  - ✅ 2026-10-07 with CRE simulated against Railway: borrow 20 nUSD / max 10 % → settle-loans `matched:1 recorded:1` → Status "20 nUSD · active · Rate 7.55% · Due 21.51 nUSD · Collateral 0.01583 · Excess 0.00031 nETH"; execute-transfers disbursed. Withdraw excess → collateral 0.01552, button gone. Repay (signature) → loan gone from Status; execute-transfers `executed=3`, `executed=3`, `no-pending`. Profile: Bronze → Silver, 1.8x, rep 10, 1 repaid, 100 % success.
  - ✅ Fixed and re-tested 2026-10-07 after `de9d800` (Railway): borrow 15 nUSD at Silver 1.8x (collateral 0.01076 nETH) accepted by the verifying server; matched at 8.00 %, due 16.2 nUSD, disbursed. New web Repay: private transfer to the pool + repay signature → loan closed; pool private nUSD 46.49 → 62.69 (+16.2), so the repayment really reached the pool.
  - 🔴 Ghost parity, security: web Repay only signs `/repay`; it moves no funds. The server trusts it, credits lenders from the pool and returns collateral. Raycast/e2e pay the pool first. See RISKS.
  - ⚠️ Ghost parity, display: Silver after 1 repay shows "-40% to Gold" (`ProfileHeader` uses thresholds 5/15; server tiers differ).
  - 2026-10-07: Status tab renders "Your Positions" / "No active intents or loans found." after both cancels. Repay / claim excess need a matched loan (CRE not deployed).
- [x] Profile: tier, stats, explorer link opens testnet.monadvision.com; Withdraw presets; ticket redeem
  - 2026-10-07: `/profile` returns 200; `EXPLORER_URL = https://testnet.monadvision.com` (`lib/constants.ts`). Wallet-dependent parts pending.
  - 2026-10-07 (wallet `0xB7fD…1a83`): Bronze / 2x / "0% to Silver", stats 0, MonadVision link to `testnet.monadvision.com/address/0xB7fD…`; Private Wallet → Fetch Balances (signature) → nUSD 0 / nETH 0; Withdraw presets 25 / 50 / 75 / Max and "Withdraw to Wallet" shown. Ticket redeem not run: private balance is 0 until CRE execute-transfers pays the two cancel refunds (10 nUSD, 0.01584 nETH).
  - ✅ 2026-10-07 ticket redeem: CRE execute-transfers simulated against Railway (`staging-settings`, `-e` temp env with the Railway `INTERNAL_API_KEY`): `executed=3`, `executed=1`, then `no-pending`. Fetch Balances → nUSD 10 / nETH 0.01584 (both cancel refunds). Max → Withdraw to Wallet → "Requesting ticket…" → "Withdrawn" with tx hash; wallet 890 → 900 nUSD on-chain, private nUSD 0, vault nUSD unchanged at 2619.2 (ledger in step). Bell received a payout notification (7 → 8).
  - Dev-only hydration warning on the bell badge (unread count from localStorage), inherited from Ghost. ✅ Fixed 2026-10-08 at the user's request: `useNotifications` starts empty and loads stored notifications after mount (display timing only; same notifications and storage key).
- [x] Explore + pool detail render counts
  - ❌ 2026-10-07 (client dev → Railway): `/explore`, `/explore/[ticker]` return 200 but `GET /api/v1/internal/pending-intents` returns **401 Unauthorized** (Railway has `INTERNAL_API_KEY` set; the client sends no key), so no counts can render. This is the RISKS "Internal endpoint exposure" item, now live. Needs a decision before re-test.
  - ✅ fixed 2026-10-07 (`6ab41c8`, deployed to Railway): Explore, hero, pool detail and TG `/pool_status` use public `GET /api/v1/pending-intents` (token + amount only); `/internal/pending-intents` still 401 without a key. Client dev → Railway: `/explore`, `/explore/nUSD` 200, proxy returns 4 nUSD lend / 0 borrow intents. Visual check by user 2026-10-07: Explore shows nUSD 4 lend / 0 borrow.
- [x] Notifications bell receives Loan Matched, Payout Pending/Received
  - ✅ partial 2026-10-07: bell received Lend Intent Active, Payout Pending, Lend Intent Consumed, Swap Complete (count 3 → 7). Loan Matched / Payout Received need CRE settle-loans / execute-transfers (not deployed).
- [ ] Dungeon page and footer FAQ show Noctrum copy and "Monad Testnet"
  - ✅ source check 2026-10-07: navbar "Dungeon" → `/infinity` (200); `Footer.tsx` and `infinity/FAQSection.tsx` copy say Noctrum / nUSD / nETH / "Monad Testnet", no Chainlink CPT wording. Visual check still pending (browser extension not connected).
- [ ] Visual review vs Ghost screenshots (T6.2 AC)
- [x] UI labels/status strings match Ghost apart from the rebrand (§6)
  - ✅ 2026-10-07 automated source diff (Ghost → Noctrum, after the REBRAND §1 token map) of every JSX text node and user-facing string literal: client 79 files, tg 19, raycast 24. Only differences: Sepolia → "Monad Testnet" and Etherscan → "MonadVision" in 6 client files (D-8/MONAD_MIGRATION), and a `No wallet` guard error in raycast `MyLoansView.tsx` (T6.3; Ghost would throw a null error there). No status label or button copy changed.

### Telegram (`noctrum-tg`)
- [ ] Each command in the Ghost README table
- [ ] WalletConnect pairing on `eip155:10143`
- [ ] `/alerts_on` notifications

### Raycast (`noctrum-raycast`)
- [ ] All 12 views
- [x] LocalStorage key `noctrum-wallet-pk`
  - ✅ 2026-10-07 source check: `noctrum-raycast/src/lib/wallet.ts` `WALLET_KEY = "noctrum-wallet-pk"` (Ghost `ghost-wallet-pk`).
