# Noctrum — Product Requirements Document

> Noctrum is a 1:1 rebuild of **Ghost Finance** (repo `ghost/`) on **Monad Testnet** (chain ID `10143`).
> Product behaviour, contract logic, CRE workflows and UX are kept identical. Only two things change: the chain (Sepolia → Monad Testnet) and the name (Ghost → Noctrum).
> One forced exception: Chainlink's hosted private-token vault/API exists only on Sepolia (see [CHAINLINK_AND_DEPENDENCIES.md](CHAINLINK_AND_DEPENDENCIES.md)). Noctrum therefore has to supply an **interface-identical replacement** that it operates itself. Users see the same flows, endpoints and signatures as in Ghost.

Source of truth for all behaviour: the Ghost code. Where Ghost's docs (`ghost/docs`, `ghost/README.md`) disagree with Ghost's code, **the code wins**. Each such disagreement is listed in [RISKS_AND_OPEN_QUESTIONS.md](RISKS_AND_OPEN_QUESTIONS.md).

---

## 1. Problem

In pooled DeFi lending (Aave, Compound style):
- Every lender earns one blended pool rate, so there is no incentive to bid truthfully, and passive lenders free-ride.
- Rate bids and positions are public, which makes front-running and rate manipulation possible.
- Collateral requirements are the same for everyone, regardless of repayment history.

## 2. Solution (what Ghost does, and Noctrum must do)

Private peer-to-peer lending with **sealed-bid, discriminatory-price rate discovery**:

1. Lenders encrypt their rate bid (ECIES secp256k1, with the CRE public key). The API server stores only the ciphertext ("blind storage").
2. Every 30 s, a **Chainlink CRE** workflow decrypts the bids inside the DON. It runs a greedy tick-matching engine (cheapest lends first, largest borrows first) and posts match proposals.
3. Each lender earns **their own bid rate** on their matched slice. The borrower pays the amount-weighted blended rate.
4. Custody runs through a **private-balance vault**: deposit on-chain, then move funds off-chain with private transfers, then withdraw with a signed ticket.
5. A CRE workflow executes every fund movement (disbursement, returns, payouts) with the pool wallet's key. That key exists only as a DON secret.
6. A CRE workflow reads Chainlink ETH/USD every 60 s and liquidates loans that are under 1.5× health or past maturity.
7. Endogenous **credit tiers** (Bronze 2.0× → Silver 1.8× → Gold 1.5× → Platinum 1.2× collateral) move up on repayment and down on default.
8. A **rejection penalty** of 5% of collateral stops borrowers using proposals as free rate discovery.

## 3. Users

| Persona | Goal | Interfaces |
|---|---|---|
| Lender | Earn yield at a privately chosen rate | Web app (Lend tab), Telegram bot, Raycast |
| Borrower | Borrow nUSD/nETH against collateral at or below a private max rate | Web app (Borrow tab), Telegram, Raycast |
| Protocol operator | Run the API, CRE workflows, pool wallet, and the vault + private-ledger service | CLI, CRE CLI, Foundry |
| Visitor | Learn about the protocol | Marketing site (`frontend/`), docs site (`docs/`) |

## 4. Value proposition

- **Rate privacy**: no one except the CRE sees plaintext rates (not the server, not on-chain observers).
- **Truthful pricing**: you earn exactly what you bid.
- **Reputation-based capital efficiency**: good borrowers post less collateral.
- **Multi-surface**: web, Telegram and Raycast all hit the same API.

## 5. Tokens (renamed 1:1)

| Ghost | Noctrum | Role | Decimals | Contract |
|---|---|---|---|---|
| Ghost USD / `gUSD` | Noctrum USD / `nUSD` ⚠️ VERIFY symbol choice (decision D-6) | Lending denomination | 18 | `SimpleToken` (ERC20 + ERC20Permit + Ownable, owner-mintable, no cap) |
| Ghost ETH / `gETH` | Noctrum ETH / `nETH` ⚠️ VERIFY (D-6) | Collateral, also lendable/borrowable | 18 | `SimpleToken` |

There is no governance token.

## 6. Features (exact parity list)

Each feature lists its Ghost implementation (file:line) so parity can be checked.

### F1 — Lend (deposit + sealed bid)
Flow, 5 steps. Web: `ghost/client/src/components/lend/LendCard.tsx:134-213`. TG: `ghost-tg/src/commands/lend.ts`. Raycast: `views/LendFormView.tsx`.
1. `approve(vault, MaxUint256)` on the token (web uses MaxUint256; TG/Raycast use the exact amount).
2. `vault.deposit(token, amount)` on-chain. The private ledger credits the depositor's private balance.
3. `POST /api/v1/deposit-lend/init {account, token, amount}` returns `{slotId, epochId}`. The slot has a 10-minute TTL. **Not signed.**
4. Private transfer of `amount` from the user to the **pool address** (`GET /health → poolAddress`), via the vault API `/private-transfer` (EIP-712, vault domain).
5. `POST /api/v1/deposit-lend/confirm {account, slotId, encryptedRate, timestamp, auth}` (EIP-712 `Confirm Deposit`, Noctrum domain). The server credits the internal balance, creates a LendIntent and returns `{status:"sealed_bid_accepted", intentId, epochId}`.

UI inputs:
- Amount, plus a coin selector (nUSD default; nETH is also allowed).
- Rate % (0 < r ≤ 100). It is converted to a decimal string `r/100` and encrypted.
- Duration in days (default 30). It is **UI-only and never sent**; loans are always 30 days.
- The summary line shows "Expected Return = amount × (1 + rate/100)".
- Hint text: "Your rate is encrypted and hidden from the server".

### F2 — Cancel lend
`POST /api/v1/cancel-lend {account, slotId, timestamp, auth}` (EIP-712 `Cancel Lend`). This deletes the intent, debits the internal balance, sets the slot to cancelled and queues a `cancel-lend` transfer of the **full original slot amount** back to the lender. It returns `{status:"cancelled", transferId}`. Errors: 404, 403 not owner, 409 no active intent.

### F3 — Borrow (collateral + sealed max rate)
Web: `client/src/components/borrow/BorrowCard.tsx:213-292`.
1. A live collateral quote runs as the user types (500 ms debounce): `GET /api/v1/collateral-quote?account&token&amount=(borrow×1.02 in wei)&collateralToken`. It returns `{tier, multiplier, ethPrice, requiredCollateral, requiredValueUsd}` and auto-fills the collateral amount (5 dp).
2. Selecting the borrow coin auto-selects the other coin as collateral (nUSD↔nETH).
3. `approve(vault, MaxUint256)` on the collateral token, then `vault.deposit(collateralToken, collateralAmount)`.
4. Private transfer of the collateral to the pool.
5. `POST /api/v1/borrow-intent` (EIP-712 `Submit Borrow`) with `encryptedMaxRate = encrypt((maxRate/100).toFixed(2))`.
6. Server check: `collateralUSD ≥ borrowUSD × tierMultiplier`. **Note:** the server values the borrow amount as `amount/1e18` USD even when the borrow token is nETH (`borrow.controllers.ts:209`). Keep this as-is for parity.

The UI shows Credit Tier, Collateral Ratio and ETH Price rows.

### F4 — Cancel borrow
Only allowed while status is `pending`. It queues a `cancel-borrow` transfer of the full collateral and sets status to `cancelled`.

### F5 — Matching (CRE settle-loans, every 30 s)
See [CRE_WORKFLOWS.md](CRE_WORKFLOWS.md) §1. Each run:
- Expire and auto-accept proposals past their TTL.
- Fetch unlocked lend intents and pending borrow intents.
- Decrypt the rates.
- Sort borrows by amount (descending) and lends by rate (ascending).
- Fill greedily, same token only.
- Skip (and roll back) a borrow if the blended rate is above its max rate.
- POST the proposals.

### F6 — Proposal accept / reject / auto-accept
- Proposal TTL is **5 s** (Ghost demo setting, `internal.controllers.ts:82`; parity default, decision D-7).
- **Accept** (`Accept Proposal` EIP-712):
  - Creates a Loan with maturity = now + 30 days and status `active`.
  - `requiredCollateral` = `principalUSD × multiplier`, converted into collateral units and capped at the posted collateral.
  - Consumes the lend ticks (deletes or decrements the LendIntents) and debits the lenders' internal balances.
  - Queues a `disburse` transfer of the principal to the borrower.
- **Reject** (`Reject Proposal`): slashes 5% of the collateral (it stays with the pool), queues `return-collateral` for the other 95%, sets borrow intent status `rejected`, and **adds each tick amount back** onto the lend intent.
- **Auto-accept**: settle-loans calls `/internal/expire-proposals`, which applies the same logic as Accept.

There is **no UI button** for accept/reject in the web client. Users act through Telegram/Raycast or let auto-accept fire. Keep it that way.

### F7 — Repay
`POST /api/v1/repay {account, loanId, amount, timestamp, auth}` (`Repay Loan`).
- Total owed = Σ ticks of `tickAmount + floor(tickAmount × rate)`. The rate is applied **flat per loan, not annualised**.
- If `amount < totalOwed` the request is rejected with 400.
- Queues a `repay-lender` transfer per tick for `tickAmount + interest`, and credits each lender's internal balance.
- Queues `return-collateral-repay` for the **full current collateralAmount**.
- Sets loan status `repaid`, increments `loansRepaid` and upgrades the tier by one.

Per-client differences, all kept 1:1:
- **Web client** calls `/repay` only and does **not** move funds (`StatusTab.tsx:207-237`, `ProfilePositions.tsx`).
- **Telegram** first approves, deposits and private-transfers `totalDue` to the pool, then calls `/repay` (`ghost-tg/src/commands/loans.ts:56-129`).
- **Raycast**: see `views/MyLoansView.tsx`.

### F8 — Claim excess collateral
`POST /api/v1/claim-excess-collateral` (`Claim Excess Collateral`). Excess = `collateralAmount − requiredCollateral`; it must be greater than 0. The loan's collateralAmount is reduced to `requiredCollateral`, and a `return-collateral` transfer is queued.

### F9 — Liquidation (CRE check-loans, every 60 s)
- Reads ETH/USD (Chainlink AggregatorV3 `latestAnswer`/`decimals` at the last finalized block) on **Arbitrum One mainnet**.
- A loan is unhealthy if `maturity < now`, or if `collateralAmount × ethPrice / principal < 1.5`.
  - The formula is applied even when the collateral is nUSD. That is a Ghost bug; keep it for parity (see RISKS).
- POSTs the unhealthy IDs to `/internal/liquidate-loans`. The server then:
  - marks the loan `defaulted`, does `loansDefaulted++`, and downgrades the tier;
  - queues a 5% protocol fee transfer to the **pool address itself**;
  - queues the other 95% as transfers split pro-rata by tick amount to the lenders, in the **collateral token**.

### F10 — Transfer execution (CRE execute-transfers, every 15 s)
Fetches pending transfers, takes the first **3**, signs each as the pool wallet (EIP-712 `Private Token Transfer`) and POSTs it to the vault API `/private-transfer`. It then confirms the successful IDs to the server.

### F11 — Credit score
`GET /api/v1/credit-score/:address` returns `{tier, loansRepaid, loansDefaulted, collateralMultiplier, ethPrice}`. A new address is lazily created as `bronze`.

### F12 — Positions / Status
- `GET /api/v1/lender-status/:address`: activeLends (with slotId), activeLoans (lender slice, weighted rate, expectedPayout), completedLoans, pending/completed payouts.
- `GET /api/v1/borrower-status/:address`: pendingIntents (`pending|proposed`), pendingProposals, activeLoans (totalDue, effectiveRate, excessCollateral, maturityDate), completedLoans, pending/completed transfers.
- Web Status tab: cancel borrow, cancel lend, claim excess, repay.
- Profile page: header (address, "Monad Testnet" badge, explorer link), stats, charts, positions, Withdraw card.

### F13 — Private balances & withdraw
- Vault API `/balances` (`Retrieve Balances`).
- `/withdraw` (`Withdraw Tokens`) returns an 89-byte ticket.
- Then `vault.withdrawWithTicket(token, amount, ticket)` on-chain.
- The withdraw card has 25/50/75/100% presets.

### F14 — Private transfer, shielded address, transaction history
- Telegram `/send`: private transfer to any address.
- Raycast: Transfer, Generate Shielded Address, Transactions (cursor pagination).

### F15 — Swap (nUSD ↔ nETH)
- On-chain `SwapPool` with owner-set prices: nUSD = $1, nETH = $2200 at deploy.
- Quote endpoint `GET /api/v1/swap-quote` uses the **live** Chainlink price.
- Client applies 1% slippage (`minOut = quote × 99/100`). Telegram applies 5%.
- Approves the exact amount, then calls `swap()`.

### F16 — Bridge (Wormhole)
- Native token transfer from another testnet into the **home chain**, using Wormhole SDK `tokenTransfer` (manual, not automatic): initiate → fetchAttestation (600 s timeout) → completeTransfer.
- Destination changes from `Sepolia` to `MonadTestnet` (see MONAD_MIGRATION).
- Source chains are the Ghost list: Base Sepolia, Arbitrum Sepolia, OP Sepolia, Avalanche Fuji, Polygon Amoy, BSC Testnet. **Sepolia becomes a source chain** and Monad becomes "home". ⚠️ VERIFY decision D-8.

### F17 — Explore
- Pools list (nUSD, nETH) with lend/borrow intent counts from `GET /api/v1/internal/pending-intents`. The browser calls it without an API key, so it only works when `INTERNAL_API_KEY` is empty. Keep for parity; see RISKS.
- Featured carousel, filter bar (network options "All Networks", "Monad Testnet").
- Pool detail page `/explore/[ticker]`: header, charts, rate-model panel, reserve status, supply/borrow info, your position, action buttons.

### F18 — Notifications
Client polls lender/borrower status every 10 s and diffs against the previous state. Notifications are stored in localStorage (key renamed to `noctrum_notifications`, max 50) and shown in the navbar bell. Event titles:
- Loan Matched
- Loan Repaid / Liquidated / Completed
- Lend Intent Consumed / Active
- Borrow Intent Consumed / Submitted
- Match Proposal
- Payout Pending / Received

Telegram has a 15 s poller toggled with `/alerts_on` and `/alerts_off`.

### F19 — Telegram bot
All commands in `ghost-tg/README.md`:
- Embedded, imported and WalletConnect wallets.
- Wallet JSON files in `data/wallets/{userId}.json`.

### F20 — Raycast extension
Single command with a menu of 12 views (`ghost-raycast/src/ghost.tsx`). The wallet private key is kept in Raycast LocalStorage.

### F21 — Marketing site and docs site
Marketing site sections: Announcement, Hero, Features, Partners, TokenBanner, FollowAlong, Newsletter, CtaBanner, Footer, plus SEO, robots, sitemap and manifest. The docs site is Docusaurus 3.9.2 and carries the same content tree, rebranded.

### F22 — "Infinity" (navbar label "Dungeon") landing page
Static marketing sections: Hero, Upgraded, Integrations, YieldSources, Proven, LearnMore, FAQ, StakeCard.

## 7. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Every user-facing write endpoint verifies EIP-712 with domain `{name:"NoctrumProtocol", version:"0.0.1", chainId:10143, verifyingContract:<NoctrumVault>}` and a ±5 min timestamp window. `deposit-lend/init` is unauthenticated, as in Ghost. |
| FR-2 | Rates are encrypted client-side with the CRE secp256k1 public key (eciesjs 0.4.x). The server never decrypts. |
| FR-3 | All amounts are 18-dec wei strings stored as strings. All addresses are lowercased before storage. |
| FR-4 | Every fund movement is a queued `PendingTransfer` executed by CRE, with reasons `cancel-lend`, `cancel-borrow`, `disburse`, `return-collateral`, `repay-lender`, `return-collateral-repay`, `liquidate`. |
| FR-5 | Internal endpoints are guarded by `x-api-key` when `INTERNAL_API_KEY` is set. |
| FR-6 | The vault API is wire-compatible with Chainlink's Compliant Private Token API (5 endpoints, same EIP-712 types, same 89-byte ticket). See CONTRACTS/BACKEND. |
| FR-7 | Credit tiers and multipliers exactly as §2. Upgrade on repay, downgrade on liquidation, both capped at the ends. |
| FR-8 | Matching, interest, liquidation split and penalty math are bit-for-bit as Ghost, including float math (`Number()`), `Math.floor`, `Math.ceil` and integer division. |

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Runtime Bun for all TS packages. Next.js 16.1.6 for the app, Next 15 for the marketing site, Docusaurus 3.9.2 for docs. |
| NFR-2 | CRE workflows compile to WASM with `@chainlink/cre-sdk` (Ghost resolves 1.1.3). Only root-package imports. |
| NFR-3 | Workflow cadence: settle 30 s, execute 15 s, check 60 s. At most 5 confidential HTTP calls per execution. |
| NFR-4 | Must work with Monad's gas-limit charging, sub-second blocks and the 100-block `eth_getLogs` range on the public RPC. |
| NFR-5 | No secrets in the repo. Ghost committed test private keys; Noctrum must not. |
| NFR-6 | Server is stateless apart from MongoDB. `currentEpoch` stays an in-memory constant 1, as in Ghost. |

## 9. Success criteria

1. Every item in [TESTING.md](TESTING.md) §6 "Parity checklist" passes on Monad Testnet.
2. E2E scripts 01–08 pass against Noctrum on Monad Testnet.
3. All three CRE workflows simulate successfully (`cre workflow simulate … --non-interactive --trigger-index=0`) and, once deployed, run on the DON.
4. A lender can lend → be matched → be repaid → withdraw on-chain, using only the web app, Telegram, or Raycast.
5. `grep -ri ghost` over the Noctrum repo returns only allowed exceptions (see REBRAND.md §7).

## 10. Out of scope

- Any feature not in Ghost: new tokens, partial repayment, on-chain loan ledger, GhostRouter/CollateralManager implementations (Ghost ships these as **interfaces only**), ZK vault, governance.
- Fixing Ghost bugs, unless the owner decides otherwise in RISKS (D-2, D-3, …).
- Monad mainnet (later).
- Browser GET UIs of the Chainlink CPT API (`/balances` etc. as HTML pages). No Ghost client uses them; listed under "Later".
