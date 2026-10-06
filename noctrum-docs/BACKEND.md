# Noctrum — Backend Services

Ghost backend services:
1. `server/` (API)
2. `ghost-tg/` (Telegram bot; a long-running service)
3. External Chainlink CPT API (not in repo)

There is no indexer, no queue broker and no cron outside CRE.

Noctrum backend services:
1. `server/` (copy, rebranded)
2. `noctrum-vault-api/` (**new**, replaces the CPT API)
3. `noctrum-tg/`

---

## 1. `server/` — Noctrum API

### 1.1 Stack & run
- Bun, Hono ^4.12.4, Mongoose ^9.2.4, ethers ^6.16.0, eciesjs ^0.4.17.
- Scripts: `dev: bun run --hot src/index.ts`.
- Dockerfile: `oven/bun:1`, `bun install --frozen-lockfile --production`, EXPOSE 8080, `CMD bun run src/index.ts`.
- tsconfig: ESNext, bundler, strict, `jsxImportSource hono/jsx`.
- CORS `origin: "*"`.
- `index.ts`: `await connectDB()`, `GET /health → {status:"ok", version:"1", poolAddress}`, `GET /cre-public-key → {publicKey}`, mounts `/api/v1`. Log "GHOST server running on port X" → "NOCTRUM server running…".
- `db.ts`: `mongoose.connect(MONGODB_URI)`. Errors are logged, not fatal.

### 1.2 Config (`src/config.ts`)
| Key | Required | Ghost default | Noctrum default |
|---|---|---|---|
| `MONGODB_URI` | no | `mongodb://localhost:27017/ghost` | `mongodb://localhost:27017/noctrum` |
| `POOL_PRIVATE_KEY` | no | "" | "" (only used to derive `poolAddress`) |
| `TOKEN_ADDRESS` | **yes** | — | nUSD address |
| `CRE_PUBLIC_KEY` | **yes** | — | new key |
| `EXTERNAL_API_URL` | no | CPT URL | `NOCTRUM_VAULT_API_URL` value |
| `EXTERNAL_VAULT_ADDRESS` | no | `0xE588…2d13` | NoctrumVault ⚠️ |
| `CHAIN_ID` | no | 11155111 | 10143 |
| `PORT` | no | 8080 | 8080 |
| `INTERNAL_API_KEY` | no | "" (empty disables the guard) | set in prod |
| `ARBITRUM_RPC_URL` | no | `https://arbitrum-one-rpc.publicnode.com` | same |
| `ETH_USD_FEED` | no | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` | same |
| `GETH_ADDRESS` | no | gETH Sepolia | rename `NETH_ADDRESS`, nETH Monad |

`TOKEN_ADDRESS` = nUSD. The code calls it "USD collateral". Keep the variable name or rename it to `NUSD_ADDRESS` (D-12; REBRAND recommends keeping `TOKEN_ADDRESS`).

### 1.3 Auth (`src/auth.ts`)
- Domain `{name:"GhostProtocol"→"NoctrumProtocol", version:"0.0.1", chainId: CHAIN_ID, verifyingContract: EXTERNAL_VAULT_ADDRESS}`.
- Message types, primary type → fields:

| Primary type | Fields |
|---|---|
| Confirm Deposit | account address, slotId string, encryptedRate string, timestamp uint256 |
| Cancel Lend | account, slotId, timestamp |
| Submit Borrow | account, token address, amount uint256, collateralToken address, collateralAmount uint256, encryptedMaxRate string, timestamp |
| Cancel Borrow | account, intentId string, timestamp |
| Accept Proposal | account, proposalId string, timestamp |
| Reject Proposal | account, proposalId string, timestamp |
| Repay Loan | account, loanId string, amount uint256, timestamp |
| Claim Excess Collateral | account, loanId string, timestamp |

- `checkTimestamp`: `|now − ts| > 300 s` throws "Signature expired: timestamp outside 5-minute window".
- `authenticate`: `ethers.verifyTypedData`, compared case-insensitively. Mismatch throws "Signature mismatch: recovered X, expected Y".
- Every controller catches errors and returns **401** with `{error: message}`, including non-auth errors (parity).

### 1.4 Data model (MongoDB / Mongoose; all `timestamps:false`, amounts are strings)
| Model (collection) | Fields | Indexes |
|---|---|---|
| DepositSlot | slotId (unique), userId, token, amount, status enum pending/confirmed/cancelled, encryptedRate?, intentId?, createdAt Number, epochId Number | slotId unique |
| LendIntent | intentId (unique), userId, token, amount, encryptedRate, epochId, createdAt | |
| BorrowIntent | intentId (unique), borrower, token, amount, encryptedMaxRate, collateralToken, collateralAmount, status enum pending/proposed/matched/cancelled/rejected, createdAt | |
| MatchProposal | proposalId (unique), borrowIntentId, borrower, token, principal, matchedTicks[{lender, lendIntentId, amount, rate Number}] (_id false), effectiveBorrowerRate Number, collateralToken, collateralAmount, status pending/accepted/rejected/expired, createdAt, expiresAt | |
| Loan | loanId (unique), borrower, token, principal, matchedTicks[…], effectiveBorrowerRate, collateralToken, collateralAmount, requiredCollateral, maturity Number (ms), status active/repaid/defaulted, repaidAmount | |
| PendingTransfer | transferId (unique), recipient, token, amount, reason enum (7), createdAt, status pending/completed/failed | |
| Balance | user, token, amount | (user, token) unique |
| CreditScore | address (unique), tier enum bronze/silver/gold/platinum, loansRepaid, loansDefaulted | |

`src/types.ts` mirrors these interfaces (bigint amounts) and adds `CreditTier`/`CreditScore`.

### 1.5 State helpers (`src/state.ts`)
- `SLOT_TTL_MS = 10 min`.
- `currentEpoch = 1` (never incremented).
- `getCollateralMultiplier`: platinum 1.2, gold 1.5, silver 1.8, bronze 2.0.
- `queueTransfer(recipient, token, amount, reason)` uses `crypto.randomUUID()` and lowercases addresses.
- `creditBalance` / `debitBalance` (debit returns false if insufficient, no throw) / `getBalance`.
- `getCreditScore` lazily creates bronze.
- `upgradeTier` / `downgradeTier` use `TIER_ORDER` and cap at the ends.
- `expireOldSlots` marks pending slots older than 10 min as `cancelled`.

### 1.6 Endpoints (prefix `/api/v1`)

User-facing (EIP-712 except init):

| Method & path | Body / query | Success | Errors |
|---|---|---|---|
| POST `/deposit-lend/init` | account, token, amount | `{slotId, epochId}` (runs `expireOldSlots` first) | 400 missing, 401 catch-all |
| POST `/deposit-lend/confirm` | account, slotId, encryptedRate, timestamp, auth | `{status:"sealed_bid_accepted", intentId, epochId}` | 404, 410 expired/TTL, 409 already confirmed, 403 not owner |
| POST `/cancel-lend` | account, slotId, timestamp, auth | `{status:"cancelled", transferId}` | 404, 403, 409 "No active intent for this slot" |
| POST `/borrow-intent` | account, token, amount, collateralToken, collateralAmount, encryptedMaxRate, timestamp, auth | `{status:"borrow_intent_created", intentId}` | 400 "Collateral token must be gUSD or gETH" (→ nUSD/nETH), 400 "Insufficient collateral for credit tier" with {tier, multiplier, ethPrice, requiredUsd, providedUsd, provided} |
| POST `/cancel-borrow` | account, intentId, timestamp, auth | `{status:"cancelled", transferId}` | 404, 403, 409 "Can only cancel pending intents" |
| POST `/accept-proposal` | account, proposalId, timestamp, auth | `{status:"accepted", loanId, transferId}` | 404, 403, 409 not pending, 410 expired |
| POST `/reject-proposal` | same | `{status:"rejected", slashed, returned, transferId}` | 404, 403, 409 |
| POST `/repay` | account, loanId, amount, timestamp, auth | `{status:"repaid", loanId, totalPaid, transferId}` | 404, 403, 409, 400 "Insufficient repayment" {required, provided} |
| POST `/claim-excess-collateral` | account, loanId, timestamp, auth | `{status:"excess_claimed", loanId, excessReturned, remainingCollateral, transferId}` | 400 "No excess collateral" {locked, required} |
| GET `/collateral-quote` | account, token, amount, collateralToken | `{tier, multiplier, ethPrice, requiredCollateral, requiredValueUsd}` | 400 |
| GET `/lender-status/:address` | — | `{address, activeLends[{intentId, slotId, token, amount, createdAt}], activeLoans[{loanId, token, principal, rate, expectedPayout, maturity, maturityDate, borrower}], completedLoans, pendingPayouts, completedPayouts}` | |
| GET `/borrower-status/:address` | — | `{address, pendingIntents, pendingProposals[{proposalId, token, principal, effectiveRate, collateralToken, collateralAmount, expiresAt}], activeLoans[{…, totalDue, repaidAmount, requiredCollateral, excessCollateral, maturityDate}], completedLoans, pendingTransfers, completedTransfers}` | |
| GET `/credit-score/:address` | — | `{tier, loansRepaid, loansDefaulted, collateralMultiplier, ethPrice}` | |
| GET `/swap-quote` | tokenIn, tokenOut, amountIn | `{tokenIn, tokenOut, amountIn, amountOut, ethPrice, rate}` with rate strings "1 gUSD = x gETH" / "1 gETH = y gUSD" (→ nUSD/nETH) | 400 "Only gUSD and gETH supported" (→ renamed) |

Internal (`x-api-key` when the key is set):

| Method & path | Behaviour |
|---|---|
| GET `/internal/pending-intents` | All LendIntents minus those locked by pending proposals, plus BorrowIntents with status `pending` |
| POST `/internal/record-match-proposals` | `{proposals}`. Creates each proposal with **expiresAt = now + 5 s**, sets borrow intent `proposed`. Returns `{recorded}` |
| POST `/internal/expire-proposals` | Auto-accepts pending proposals past expiresAt (same logic as accept). Returns `{autoAccepted, errors?}` |
| POST `/internal/check-loans` | Active loans with all fields |
| GET `/internal/pending-transfers` | `{transfers:[{id, recipient, token, amount, reason, createdAt, status}]}` |
| POST `/internal/confirm-transfers` | `{transferIds}` sets pending → completed. Returns `{confirmed}` |
| POST `/internal/liquidate-loans` | `{loanIds}`. Returns `{liquidated, transfers}` (see PRD F9) |

### 1.7 Exact math (parity-critical)
- Collateral check (borrow-intent): `collateralUsd = isUsd ? col/1e18 : col/1e18*eth`. `requiredUsd = borrow/1e18 * mult` (borrow token ignored).
- Required collateral (accept/expire): `principalUsd = isEthBorrow ? p/1e18*eth : p/1e18`. `reqUsd = principalUsd*mult`. `reqCol = isUsdCol ? ceil(reqUsd*1e18) : ceil(reqUsd/eth*1e18)`, capped at the posted collateral.
- Quote: the same as accept, with `ethPrice` fetched only when needed.
- Interest: `floor(Number(tickAmount) * rate)`.
- Lender expectedPayout: `principal + floor(principal * weightedRate)`.
- Reject slash: `collateral*5/100` (bigint).
- Liquidation: fee `collateral*5n/100n` to the pool. Lender share `lenderPool*tick/totalPrincipal` (bigint).
- Swap quote: `nUSD→nETH: amountIn*1e18 / round(eth*1e18)`. `nETH→nUSD: amountIn*round(eth*1e18)/1e18`.
- `price.ts`: ethers `JsonRpcProvider(ARBITRUM_RPC_URL)`, `latestAnswer/decimals`, 60 s cache.

### 1.8 External API client (`src/external-api.ts`)
- Domain `NoctrumPrivateToken` (D-5).
- `requestWithdrawTicket`, `privateTransfer` (flags []), `getBalance`, each signed with the pool wallet.
- **Not called by any controller** (transfers moved to CRE); keep it for parity.

### 1.9 Scripts and tests
- `seed-loan.ts`, `scripts/{e2e-test,real-flow-test,borrow-flow-test}.ts` contain **hard-coded Sepolia private keys** and addresses. In Noctrum, read keys from env and never commit them.
- `src/__tests__/lend.test.ts` is **stale**: it imports `state` and `activeBuffer`, which no longer exist, so it fails. Decision D-17: port it as-is (failing) or rewrite against Mongo (recommended, test-only).

---

## 2. `noctrum-vault-api/` (NEW): CPT-compatible private ledger

Purpose: reproduce `https://convergence2026-token-api.cldev.cloud` on Monad so that every Ghost call site works with only a URL, address and chainId change. Spec source: [CPT API docs](https://convergence2026-token-api.cldev.cloud/docs) + `ghost/transfer-demo/README.md` + `api-scripts/`.

### 2.1 Stack (proposed, mirrors server)
Bun + Hono + Mongoose + ethers 6. Port 8081. Dockerfile like `server/`.

### 2.2 Auth
- EIP-712 domain `{name: "NoctrumPrivateToken" (D-5), version:"0.0.1", chainId:10143, verifyingContract: NoctrumVault}`.
- Timestamp window ⚠️ VERIFY. CPT uses the error `request_auth_expired`; adopt ±5 min, as the Noctrum API does.
- Error format: `{"error": "<code>", "error_details": "<text>", "request_id": "<uuid>"}`.
- Codes: `bad_request`, `request_auth_failed`, `request_auth_expired`, `insufficient_balance`, `operation_denied_by_policy`, `invalid_recipient`.

### 2.3 Endpoints (all POST, JSON)
| Path | Primary type & fields | Request body | Response |
|---|---|---|---|
| `/balances` | `Retrieve Balances`: account address, timestamp uint256 | `{account, timestamp, auth}` | `{"balances":[{"token":"0x…","amount":"<wei>"}]}` |
| `/transactions` | `List Transactions`: account, timestamp, cursor string, limit uint256 | `{account, timestamp, auth, limit, cursor?}` (sign with cursor "" when absent) | `{"transactions":[{id, type:"deposit"\|"withdrawal"\|"transfer", account?, sender?, recipient?, token, amount, tx_hash?, is_incoming?, is_sender_hidden?, status? (withdrawal: pending/completed/refunded)}], "has_more", "next_cursor"}` |
| `/private-transfer` | `Private Token Transfer`: sender, recipient, token, amount, flags string[], timestamp | `{account, recipient, token, amount, flags, timestamp, auth}` (signed message uses `sender = account`) | `{"transaction_id":"<uuid v7>"}` |
| `/shielded-address` | `Generate Shielded Address`: account, timestamp | `{account, timestamp, auth}` | `{"address":"0x…"}` |
| `/withdraw` | `Withdraw Tokens`: account, token, amount, timestamp | `{account, token, amount, timestamp, auth}` | `{id, account, token, amount, deadline, ticket}` |

Flags: `hide-sender` / `hideSender` / `hide_sender`.

### 2.4 Behaviour
- **Deposit indexer**: poll `Deposit(user, token, amount)` logs on NoctrumVault and credit `user`.
  - Use the `finalized` tag (Monad: finalized after 2 blocks).
  - Page in ≤ 100-block windows (QuickNode public RPC limit, [RPC differences](https://docs.monad.xyz/reference/rpc-differences.md)).
  - Persist `lastProcessedBlock`. Idempotent per (txHash, logIndex).
- **Private transfer**:
  1. Verify the signature.
  2. Resolve the recipient: shielded address → owner, else use as-is.
  3. Run the policy check: `eth_call` the PolicyEngine via the vault's `checkPrivateTransferAllowed` (CPT behaviour).
  4. Atomically debit the sender and credit the recipient (Mongo transaction).
  5. Record the tx.
  
  The pool address is a normal account.
- **Shielded address**: random 20-byte address mapped to the account (unique). Multiple per account are allowed.
- **Choices where CPT docs are silent (T5.3b):**
  - `/private-transfer`: policy `TokenNotRegistered` → `bad_request`; any other revert → `operation_denied_by_policy`. Unknown flags, `amount ≤ 0` and a non-array `flags` → `bad_request`. Zero address or malformed recipient → `invalid_recipient`.
  - History stores the resolved owner (for lookups) and the address the sender used. Responses only ever show the address the sender used, so a sender never learns who owns a shielded address. With hide-sender, `sender` is left out of the recipient's view.
  - `/transactions`: newest first by UUID v7 id; `cursor` = last id seen (exclusive). `limit` defaults to 10 when absent (signed as 10) and is capped at 100. `next_cursor` is `null` when `has_more` is false.
- **Withdraw**:
  1. Verify, then debit the balance.
  2. `nonce = random uint128`, `deadline = now + 3600`.
  3. Sign EIP-712 `WithdrawTicket(account, token, amount, nonce, deadline)` with `TICKET_SIGNER_PRIVATE_KEY`.
  4. `ticket = nonce(16) ‖ deadline(8) ‖ sig(65)`.
  5. Store the record as pending.
  
  Indexer on `Withdraw` → completed. A sweeper refunds unredeemed tickets after the deadline (marks them refunded and re-credits) — CPT: "If the ticket is not redeemed within 1 hour, the balance is automatically refunded".
- **Invariant job**: for each token, `vault.balanceOf ≥ Σ balances + Σ pending tickets`. Alert if broken.

### 2.5 Env
`PORT`, `MONGODB_URI`, `RPC_URL`, `CHAIN_ID`, `VAULT_ADDRESS`, `POLICY_ENGINE_ADDRESS`, `TICKET_SIGNER_PRIVATE_KEY`, `START_BLOCK`, `LOG_RANGE` (100), `POLL_MS` (2000). See ENV_AND_CONFIG.md.

---

## 3. `noctrum-tg/` — Telegram bot service
- Stack: Bun, grammY ^1.35, `@walletconnect/sign-client` ^2.23.7, ethers ^6.13.4, eciesjs ^0.4.13.
- Run: `bun run src/index.ts`. Docker copies `.env` **into the image** (Ghost; keep or switch to runtime env, D-18) and uses a `/app/data` volume.
- `config.ts`: custom .env loader. `RPC_URL`, `GHOST_API_URL`→`NOCTRUM_API_URL` (default `http://localhost:8080`), `EXTERNAL_API_URL`, `VAULT_ADDRESS`, `CHAIN_ID`, `BOT_TOKEN` (required, exits if missing), `CRE_PUBLIC_KEY`, `WC_PROJECT_ID`. Token addresses and `SWAP_POOL_ADDRESS` are **hard-coded** (parity → hard-code the Monad addresses, or env, D-12).
- `constants.ts`: `GHOST_DOMAIN`/`EXTERNAL_DOMAIN` use a **hard-coded chainId 11155111 and vault address** (not env) → hard-code 10143 / NoctrumVault.
- Modules:
  - `api.ts`: ghostGet/ghostPost → noctrumGet/noctrumPost, encryptRate, ensureGasBalance (0.001 native), ensureTokenBalance, privateTransfer, balances, withdraw
  - `wallet.ts`: JSON per user in `data/wallets/{userId}.json`, holding type embedded/imported/connected, privateKey, address, createdAt
  - `wc.ts`
  - `notifier.ts`: 15 s poll
  - `ui.ts`, `middleware.ts` (`requireWallet`)
  - `commands/*`
- Security parity note: private keys are stored in **plaintext JSON**. Listed under "Later".
