# Noctrum — Testing Plan

Goal: prove **behavioural parity with Ghost** on Monad Testnet. The tests Ghost already ships are listed first, then the new tests Noctrum needs.

## 1. Existing Ghost tests (port 1:1, with notes)

| Ghost test | State in Ghost | Noctrum |
|---|---|---|
| `server/src/__tests__/lend.test.ts` (bun:test) | **Broken**: imports `state`/`activeBuffer`, which no longer exist | D-17: rewrite against Mongo (mongodb-memory-server or a test DB) with the same 9 cases: init 200/400; confirm 200/401/410/409; cancel 200/403/409 |
| `noctrum-settler/*/main.test.ts` | Stale hello-world templates; do not compile | Replace with real unit tests (§2.2) |
| `settle-loans/test-ecies.ts` | Script, round-trip ECIES | Keep: `bun run test-ecies.ts` |
| `server/scripts/{e2e-test,real-flow-test,borrow-flow-test}.ts`, `seed-loan.ts` | Manual scripts with hard-coded keys | Port with env keys |
| `e2e-test/src/01…08`, `withdraw-now.ts` | Manual integration scripts | Port (§4) |
| Foundry tests | **None** in Ghost | Add (§2.1) |

## 2. Unit tests (new, test-only; product code unchanged)

### 2.1 Contracts (Foundry: `forge test`)
- SimpleToken: name/symbol/decimals, owner-only mint, permit.
- NoctrumSwapPool: every require string; getAmountOut math (`1e18 nETH → 2200e18 nUSD`); swap balances/events; owner-only admin; removeLiquidity with no support check.
- NoctrumVault:
  - register: first registration, duplicate revert, registrar-only update/delete, events.
  - deposit: unregistered revert, zero revert, transfer + `Deposit` event.
  - withdrawWithTicket:
    - valid ticket from the signer key (build an 89-byte ticket in the test with `vm.sign`)
    - expired, reused nonce, wrong signer, wrong msg.sender, wrong amount/token, bad length
    - `Withdraw` event with `keccak256(ticket)`
  - PolicyEngine integration with defaultAllow=true.
- InterestAccrual: pure math vectors (`1000e18 @ 500 bps 365 d = 50e18`).
- Fork test: `forge test --fork-url https://testnet-rpc.monad.xyz` against the deployed addresses (smoke: register status, `ticketSigner()`).

### 2.2 CRE workflows (`bun test` with `@chainlink/cre-sdk/test` `newTestRuntime`)
- Extract `runMatchingEngine`/`decryptRate` into a testable export without changing logic.
  ✅ Done in T4.2: `settle-loans/matching.ts` and `execute-transfers/eip712.ts` (moved verbatim). They cannot stay as `export function` in `main.ts`: `cre workflow build` fails with "Exported functions with parameters are not supported". Exported `const` arrows (`onCronTrigger`, `initWorkflow`) are fine.
- Handlers are tested end to end with `ConfidentialHttpMock` and `EvmMock` + `addContractMock` from `@chainlink/cre-sdk/test`; secrets via `newTestRuntime(new Map([["default", new Map([[id, value]])]]))`.
- Vectors:
  - Lends A 500 @ 0.05, B 500 @ 0.08; borrow 800, max 0.10 → ticks A 500 @ 0.05, B 300 @ 0.08; blended 0.06125.
  - Blended > max → no proposal and remaining restored.
  - Token mismatch skipped.
  - Partial fill.
  - Ordering: largest borrow first.
- `decryptRate`: plaintext `"0.07"` → 0.07; `"0x"+ciphertext` → **real rate** (D-2 = b; Ghost returned 0.05); bare hex ciphertext → real rate; garbage / no key / wrong key → 0.05.
- check-loans health: matured → unhealthy; ratio < 1.5 → unhealthy; nUSD collateral still multiplied by the ETH price (parity).
- execute-transfers: slices to 3; EIP-712 domain/types snapshot.

### 2.3 Server (`bun test`)
For each controller, cover every status code in BACKEND §1.6. Math snapshots:
- Repay: lender A 60 @ 0.05 → 63, lender B 40 @ 0.08 → 43.2 (in wei, floor).
- Liquidation: 3 transfers, 5% fee to the pool address, 95% split 60/40.
- Reject: 5% slash, ticks restored onto the lend intents.
- Expire: auto-accept creates a loan + `disburse` transfer.
- Credit tiers: bronze→silver on repay; bronze stays bronze on default; platinum cap.
- Collateral quote: tier multipliers; ETH vs USD collateral.
- Auth: wrong domain chainId (11155111) **must fail** on Noctrum. Timestamp window ±300 s.

### 2.4 noctrum-vault-api (`bun test`)
- EIP-712 verification for all 5 types (fixtures signed with ethers).
- Deposit indexing idempotency, `finalized` tag, 100-block paging.
- Private transfer: balance moves, insufficient_balance, shielded-address resolution, hide-sender flag in history.
- Withdraw: ticket byte layout (16+8+65 = 89), vault accepts it on a local anvil/fork, refund after expiry.
- Error JSON shape `{error, error_details, request_id}`.
- **Wire-compat golden tests**: replay Ghost's client request bodies (from `client/src/lib/ghost.ts`, tg `api.ts`, raycast `external-api.ts`, e2e helpers) against vault-api and assert response shapes match the CPT docs.

## 3. CRE simulation

```bash
cd noctrum-settler
# prerequisites: server + vault-api running, .env populated
cre workflow simulate ./settle-loans      --target=staging-settings --non-interactive --trigger-index=0
cre workflow simulate ./execute-transfers --target=staging-settings --non-interactive --trigger-index=0
cre workflow simulate ./check-loans       --target=staging-settings --non-interactive --trigger-index=0
```
Expected outputs:
- settle-loans: `matched:1 recorded:1`, then on the next run `no-match` (or `no-proposals`).
- execute-transfers: `executed=N failed=0`.
- check-loans: `checked=N unhealthy=M liquidated=K ethPrice=…`.

✅ **Run 2026-10-06 (T5.4)** with `--target=local-settings` (each workflow has `config.local.json` → server `http://localhost:8080/api/v1`, vault-api `http://localhost:8081`; staging keeps the `*.example.noctrum` placeholders until D-9). Setup:
- MongoDB 8.2 single-node replica set `rs0` on 27017 (vault-api needs transactions); `server/.env` and `noctrum-vault-api/.env` (ticket-signer key from `.secrets/`); `noctrum-settler/.env` per ENV_AND_CONFIG §3.
- Seed: e2e steps 1–3 replayed on Monad (`e2e-test/` is still the Sepolia/Ghost copy until T7.1) with the same amounts and rates, against the local services. Wallets already held 0.5 MON (T0.4), so no gas sends. Result: lenders 500 + 500 nUSD @ 5 % / 8 %, borrower 5 nETH; pool private nUSD 1000, nETH 5; 2 lend intents + 1 borrow intent (800 nUSD, max 10 %).
- Results:
  - settle-loans → `matched:1 recorded:1`; proposal principal 800, ticks 500 @ 0.05 + 300 @ 0.08, blended **0.06125** (D-2 fix works in the CRE WASM runtime). Second run after 6 s → `no-match`; proposal `accepted`, loan `active`, `disburse` transfer queued.
  - execute-transfers → `executed=1 failed=0`; transfer `completed`; borrower private nUSD = 800 on vault-api.
  - check-loans → `checked=1 unhealthy=0 liquidated=0 ethPrice=2714.29`.
- RPC note: `https://arbitrum-one-rpc.publicnode.com` (Ghost's value) and `arbitrum.drpc.org` fail the `LAST_FINALIZED_BLOCK_NUMBER` reads with "historical state … is not available". `project.yaml` now uses `https://arb1.arbitrum.io/rpc` for every target.

## 4. End-to-end on Monad Testnet (`e2e-test/`, run in order)

| Step | Script | Pass criteria |
|---|---|---|
| 1 | `bun run src/01_transfer-funds.ts` | Lenders hold 500 nUSD, borrower 5 nETH, all have MON gas (D-16 amounts) |
| 2 | `02_vault_deposit_and_lend.ts` | 2 lend intents; pool private nUSD +1000 |
| 3 | `03_vault_deposit_and_borrow.ts` | Borrow intent 800 nUSD / 5 nETH / max 10% |
| — | CRE: settle-loans, wait 6 s, settle-loans, execute-transfers, check-loans | Loan active; borrower private nUSD = 800 |
| 4 | `04_check_final_loan_and_withdraw.ts` | Ticket redeemed on Monad; borrower on-chain nUSD += 800 |
| 5 | `05_check_credit_score.ts` | bronze, 2.0× |
| 6 | `06_repay_and_check_upgrade.ts` | 2 repay-lender transfers (63 / 43.2), collateral return queued, loansRepaid +1 |
| 7 | `07_liquidation_flow.ts` | liquidated 1, 3 transfers, loansDefaulted ≥ 1 |
| 8 | `08_collateral_tier_check.ts` | Low collateral rejected with "Insufficient collateral"; high accepted |

Note: Ghost's step 5 expects bronze. It must run on a fresh borrower (Ghost ran it before 6/7).

## 5. Manual UI checklist (web, TG, Raycast)

Web:
- Connect via Privy; wallet switches to 10143.
- Lend flow: 5 status labels appear in order; intent listed; Cancel works.
- Borrow: quote auto-fills (×1.02 buffer); tier/ratio/ETH price rows; submit; listed; cancel.
- Swap: quote and rate label; 1% slippage; tx hash shown; notification.
- Bridge: from Sepolia/Base Sepolia → Monad Testnet completes (attest ≤ 10 min).
- Status: repay, claim excess, cancel.
- Profile: tier, stats, explorer link opens the Monad explorer; Withdraw presets; ticket redeem.
- Explore + pool detail render counts.
- Notifications bell receives Loan Matched, Payout Pending/Received.
- Dungeon page and footer FAQ show Noctrum copy and "Monad Testnet".

Telegram: each command in the Ghost README table; WalletConnect pairing on 10143; `/alerts_on` notifications.

Raycast: all 12 views; LocalStorage key `noctrum-wallet-pk`.

## 6. Parity checklist (sign-off)

- [ ] All 8 EIP-712 Noctrum types byte-identical to Ghost except `domain.name`, `chainId` and `verifyingContract`
- [ ] All 5 vault-API types identical to CPT
- [ ] Endpoint list and JSON shapes identical (BACKEND §1.6), with token names in error strings renamed
- [ ] Matching output identical on the same inputs (golden test using Ghost's code vs Noctrum's)
- [ ] Interest/penalty/liquidation/tier math identical (unit snapshots)
- [ ] Cron schedules identical (30/15/60 staging; prod as Ghost)
- [ ] Proposal TTL 5 s, slot TTL 10 min, maturity 30 d, auth window 5 min, ticket 1 h
- [ ] Polling intervals 10 s client, 15 s tg
- [ ] Every UI label/status string matches Ghost apart from the rebrand
- [ ] `grep -ri ghost` residuals limited to the REBRAND §7 allow-list
- [ ] No Sepolia references remain except Sepolia as a Wormhole source chain (D-8)
