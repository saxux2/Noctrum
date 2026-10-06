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
- [ ] **Every UI label/status string matches Ghost apart from the rebrand.** Covered by the §5 manual pass below.
- [x] **`grep -ri ghost` residuals limited to the REBRAND §7 allow-list.** Remaining matches: `client/src/components/ui/badge.tsx` (shadcn variant); root `CLAUDE.md` (names Ghost as the reference source, same role as `noctrum-docs/`); gitignored build output (`contracts/out/`); `.git` logs.
- [x] **No Sepolia references except as a Wormhole source chain (D-8).** `client/.../privy-provider.tsx` keeps sepolia/baseSepolia/arbitrumSepolia/optimismSepolia as bridge sources (D-8). Fixed in this task: `contracts/api-scripts/src/common.ts` pointed at the Sepolia CPT API (`CompliantPrivateTokenDemo`, 11155111, `0xE588…`). It now targets `noctrum-vault-api` (`VAULT_API_URL`, default `localhost:8081`), `NoctrumPrivateToken`, 10143 and NoctrumVault. Other matches are gitignored build output (`contracts/out/`, `client/tsconfig.tsbuildinfo`).

## §5 Manual UI checklist (operator)

Record date, result and any notes per line. Stack: server :8080 + vault-api :8081 locally, or Railway.

### Web (`client/`)
- [ ] Connect via Privy; wallet switches to 10143
- [ ] Lend flow: 5 status labels appear in order; intent listed; Cancel works
- [ ] Borrow: quote auto-fills (×1.02 buffer); tier/ratio/ETH price rows; submit; listed; cancel
- [ ] Swap: quote and rate label; 1% slippage; tx hash shown; notification
- [ ] Bridge: Sepolia/Base Sepolia → Monad Testnet completes (attest ≤ 10 min); first test of Wormhole `MonadTestnet` (6.1.4)
- [ ] Status: repay, claim excess, cancel
- [ ] Profile: tier, stats, explorer link opens testnet.monadvision.com; Withdraw presets; ticket redeem
  - 2026-10-07: `/profile` returns 200; `EXPLORER_URL = https://testnet.monadvision.com` (`lib/constants.ts`). Wallet-dependent parts pending.
- [ ] Explore + pool detail render counts
  - ❌ 2026-10-07 (client dev → Railway): `/explore`, `/explore/[ticker]` return 200 but `GET /api/v1/internal/pending-intents` returns **401 Unauthorized** (Railway has `INTERNAL_API_KEY` set; the client sends no key), so no counts can render. This is the RISKS "Internal endpoint exposure" item, now live. Needs a decision before re-test.
- [ ] Notifications bell receives Loan Matched, Payout Pending/Received
- [ ] Dungeon page and footer FAQ show Noctrum copy and "Monad Testnet"
  - ✅ source check 2026-10-07: navbar "Dungeon" → `/infinity` (200); `Footer.tsx` and `infinity/FAQSection.tsx` copy say Noctrum / nUSD / nETH / "Monad Testnet", no Chainlink CPT wording. Visual check still pending (browser extension not connected).
- [ ] Visual review vs Ghost screenshots (T6.2 AC)
- [ ] UI labels/status strings match Ghost apart from the rebrand (§6)

### Telegram (`noctrum-tg`)
- [ ] Each command in the Ghost README table
- [ ] WalletConnect pairing on `eip155:10143`
- [ ] `/alerts_on` notifications

### Raycast (`noctrum-raycast`)
- [ ] All 12 views
- [ ] LocalStorage key `noctrum-wallet-pk`
