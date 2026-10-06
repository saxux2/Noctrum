# Noctrum — Chainlink CRE Workflows

CRE project: Ghost `ghost/ghost-settler/` → Noctrum `noctrum-settler/`. It has three TypeScript workflows, each with its own `package.json`, `tsconfig.json`, `workflow.yaml`, `config.staging.json` and `config.production.json`.

## 0. Facts common to all workflows

| Item | Ghost value | Noctrum |
|---|---|---|
| Trigger | `CronCapability().trigger({schedule})` with 6-field (seconds) cron | Same |
| Capabilities used | **ConfidentialHTTPClient** (all three), **EVMClient read** (check-loans only, Arbitrum). **No EVM writes, no reports, no consumer contracts, no forwarder.** | Same, so **no Monad forwarder address is needed** |
| SDK | `@chainlink/cre-sdk` `^1.0.9` (settle) / `^1.1.1` (others). The lockfile resolves **1.1.3**, javy-plugin 1.1.1 | Keep 1.1.x for parity. Upgrade to ≥ v1.19.0 only if a workflow ever reads or writes Monad (D-11). CRE docs: "Monad Testnet — CLI v1.30.0+, TS SDK v1.19.0+" ([supported networks](https://docs.chain.link/cre/supported-networks-ts)) |
| Other deps | settle: `eciesjs ^0.4.17`. execute: `viem ^2.47.0`. check: `viem ^2.34.0` | Same |
| Handler shape | `(runtime: Runtime<Config>, _payload: CronPayload): string` (execute-transfers is `async`, returning `Promise<string>`) | Same |
| Runner | `Runner.newRunner<Config>()` then `runner.run(initWorkflow)` | Same |
| HTTP pattern | `confClient.sendRequest(runtime, {vaultDonSecrets, request:{url, method, multiHeaders, bodyString}}).result()`, then the helpers `ok(resp)` and `json(resp)` | Same |
| Secret templating | Header `"x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] }` with `vaultDonSecrets: [{ key:"INTERNAL_API_KEY", namespace:"ghost-protocol" }]` | namespace `"noctrum-protocol"` (D-12) |
| `runtime.getSecret({id})` | `CRE_PRIVATE_KEY` (settle), `POOL_PRIVATE_KEY` (execute) | Same ids |
| Consensus | No explicit aggregation. Each node runs the handler and the DON reaches consensus on the returned string per CRE default. The ConfidentialHTTP request is the side effect | Same |
| `package.json` | name `typescript-simple-template`, `postinstall: bun x cre-setup` | Same |
| tsconfig | target/module esnext, bundler resolution, strict, `include: ["main.ts"]` | Same |

`secrets.yaml` (project root). Ghost currently maps `INTERNAL_API_KEY`, `POOL_PRIVATE_KEY` and `CRE_PRIVATE_KEY` each to an env var of the same name. `tasks/demo-tweaks.md` §4 says that for DON deployment the INTERNAL_API_KEY value should be `- ghost-protocol` (namespace).
```yaml
secretsNames:
  INTERNAL_API_KEY:
    - INTERNAL_API_KEY
  POOL_PRIVATE_KEY:
    - POOL_PRIVATE_KEY
  CRE_PRIVATE_KEY:
    - CRE_PRIVATE_KEY
```

`project.yaml`, Ghost:
```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com
    - chain-name: ethereum-mainnet-arbitrum-1
      url: https://arbitrum-one-rpc.publicnode.com
production-settings: (identical)
```
Noctrum: replace the Sepolia entry with Monad. **No workflow uses the Sepolia RPC**, so the Monad entry is only declarative. Adding it may require CLI ≥ v1.30.0 ⚠️ VERIFY.
```yaml
staging-settings:
  rpcs:
    - chain-name: monad-testnet            # selector 2183018362218727504 (chain-selectors repo)
      url: https://testnet-rpc.monad.xyz
    - chain-name: ethereum-mainnet-arbitrum-1
      url: https://arb1.arbitrum.io/rpc     # T5.4: publicnode prunes the finalized-block state check-loans reads
```
`production-settings` is identical. A `local-settings` target (same RPCs) was added in T5.4 for simulation against local services; each workflow's `local-settings` uses `config.local.json` (localhost URLs).

Chain-name/selector source: [smartcontractkit/chain-selectors selectors.yml](https://github.com/smartcontractkit/chain-selectors/blob/main/selectors.yml) shows `10143: selector 2183018362218727504, name monad-testnet`. Confirm with:
```bash
cre workflow supported-chains --output json   # ⚠️ run this and confirm "monad-testnet" + forwarder (forwarder unused by Noctrum)
```

---

## 1. settle-loans (matching engine) — `settle-loans/main.ts`

| Item | Value |
|---|---|
| Trigger | cron `*/30 * * * * *` (staging and production) |
| Config type | `{ schedule: string; ghostApiUrl: string }` → rename the key to `noctrumApiUrl` (D-12) |
| Staging config | `{"schedule":"*/30 * * * * *","ghostApiUrl":"https://do.roydevelops.tech/ghost-server/api/v1"}` |
| Production config | `{"schedule":"*/30 * * * * *"}`. ⚠️ **The API URL is missing** in Ghost prod config; parity bug, decision D-13 |
| Secrets | `CRE_PRIVATE_KEY` via getSecret (try/catch; if missing, logs "CRE_PRIVATE_KEY not available, using plaintext/default rates"). `INTERNAL_API_KEY` via vaultDonSecrets |

Steps (`main.ts:172-244`):
1. Log "settle-loans triggered".
2. POST `{base}/internal/expire-proposals` with body `{}` and headers x-api-key and content-type. The result is **ignored**.
3. GET `{base}/internal/pending-intents`. If not ok, return `"error:fetch-intents"`.
4. If there are no lends or no borrows, return `"no-match"`.
5. `runMatchingEngine(lends, borrows, crePrivateKey)`:
   - `decryptRate(enc)`:
     - (a) If `Number(enc)` is in (0,1), use it as plaintext (test mode).
     - (b) Otherwise `decrypt(privKeyHex, Buffer.from(enc, "hex"))`, then `Number(TextDecoder.decode)`, used if in (0,1).
     - (c) Otherwise **0.05**.
     - ⚠️ **Ghost bug**: every client emits `"0x"+hex`. `Buffer.from("0x…","hex")` returns an **empty buffer** (verified in Node 22: `Buffer.from("0x04abcd","hex").length === 0`), so decryption throws and every bid falls back to 0.05. Decision **D-2**: replicate this or strip `0x`.
   - Amounts become JS `Number(amount)` (float, precision loss above 2^53 wei; parity).
   - Sort borrows by amount descending, lends by rate ascending (stable `Array.sort`).
   - For each borrow, walk the lends: skip a different token, skip remaining ≤ 0. `take = min(avail, need)`. Push tick `{lender:userId, lendIntentId, amount:String(take), rate}`.
   - If `filled == 0`, skip. `blended = Σ take·rate / filled`. If `blended > maxRate`, restore the remaining and skip. Otherwise push the proposal:
     ```
     { proposalId: "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8),
       borrowIntentId, borrower, token, principal: String(filled), matchedTicks,
       effectiveBorrowerRate: blended, collateralToken, collateralAmount }
     ```
     (Partial fills are allowed: principal can be less than the borrow amount.)
6. If there are no proposals, return `"no-proposals"`.
7. POST `{base}/internal/record-match-proposals` with body `{proposals}`. If not ok, return `"error:record-proposals"`.
8. Return `"matched:<n> recorded:<recorded>"`.

HTTP calls per execution: 3 (≤ 5 limit).

## 2. execute-transfers — `execute-transfers/main.ts`

| Item | Value |
|---|---|
| Trigger | staging `*/15 * * * * *`, production `*/30 * * * * *` (Ghost; keep) |
| Config | `{schedule, ghostApiUrl, externalApiUrl, vaultAddress, chainId}` |
| Staging (Ghost) | ghostApiUrl `https://do.roydevelops.tech/ghost-server/api/v1`, externalApiUrl `https://convergence2026-token-api.cldev.cloud`, vaultAddress `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13`, chainId `11155111` |
| Staging (Noctrum) | noctrumApiUrl `<NOCTRUM_API>/api/v1`, externalApiUrl `<NOCTRUM_VAULT_API_URL>`, vaultAddress `<NoctrumVault on Monad>`, chainId **10143** |
| Production | Ghost: `{"schedule":"*/30 * * * * *"}` only (missing fields; D-13) |
| Secrets | `POOL_PRIVATE_KEY` (getSecret), `INTERNAL_API_KEY` (vaultDonSecrets) |

Steps:
1. GET `/internal/pending-transfers`. If not ok, `"error:fetch-pending"`. If empty, `"no-pending"`.
2. `transfers = all.slice(0,3)`. Budget is 1 + N + 1 ≤ 5 calls, per the code comment "CRE limits confidential HTTP calls to 5 per execution".
3. Pool key from the secret. Add `0x` if missing. `privateKeyToAccount` (viem). If the key is empty, `"error:no-pool-key"`.
4. For each transfer:
   - Build `{sender: pool, recipient, token, amount: BigInt, flags: [], timestamp: BigInt(now s)}`.
   - `signTypedData({domain:{name:"NoctrumPrivateToken",version:"0.0.1",chainId,verifyingContract:vaultAddress}, types:{"Private Token Transfer":[sender address, recipient address, token address, amount uint256, flags string[], timestamp uint256]}, primaryType, message})`.
   - POST `{externalApiUrl}/private-transfer` with body `{account, recipient, token, amount (string), flags: [], timestamp (number), auth}`, `vaultDonSecrets: []`.
   - ok → executed, otherwise failed (exceptions count as failed).
5. If nothing executed, return `"error:all-failed"`. Failed transfers stay `pending` and are retried next cycle; there is no `failed` status update.
6. POST `/internal/confirm-transfers {transferIds: executed}`. If not ok, `"error:confirm-failed executed=N"`. **Risk**: the funds moved but the server still says pending, so the transfer is re-sent next cycle (double pay). Parity; see RISKS.
7. Return `"executed=X failed=Y"`.

Domain name change: if D-5 renames the vault-API domain, change `getDomain()` accordingly. The domain must match the noctrum-vault-api verifier exactly.

## 3. check-loans — `check-loans/main.ts`

| Item | Value |
|---|---|
| Trigger | staging `*/60 * * * * *`, production `*/30 * * * * *` |
| Config | `{schedule, ghostApiUrl, feedChainName, ethUsdFeed, liquidationThreshold}` |
| Staging (Ghost) | ghostApiUrl prod host, `feedChainName: "ethereum-mainnet-arbitrum-1"`, `ethUsdFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612"`, `liquidationThreshold: 1.5` |
| Production (Ghost) | same but `ghostApiUrl: "http://localhost:3000/api/v1"` |
| ABI | `contracts/abi/PriceFeedAggregator.ts` (full EACAggregatorProxy ABI, uses `decimals`, `latestAnswer`) |
| Noctrum | **Unchanged feed** (Arbitrum One mainnet, chain-independent). Optional alternative (D-4): Monad Testnet ETH/USD feed `0x0c76859E85727683Eeba0C70Bc2e0F5781337818` ⚠️ VERIFY on https://docs.chain.link/data-feeds/price-feeds/addresses (testnet reset 2025-12-16 may have changed addresses). That would need `feedChainName: "monad-testnet"`, `isTestnet: true` (code change in `getNetwork`), and SDK ≥ 1.19.0 / CLI ≥ 1.30.0 |

Steps:
1. POST `/internal/check-loans {}`. If not ok, `"error:fetch-loans"`. If there are no loans, `"checked=0 unhealthy=0 undercollateralized=0"`.
2. `readEthPrice`: `getNetwork({chainFamily:"evm", chainSelectorName: feedChainName, isTestnet:false})`, then `new cre.capabilities.EVMClient(net.chainSelector.selector)`. Two `callContract` calls with `encodeCallMsg({from: zeroAddress, to: feed, data})` at `LAST_FINALIZED_BLOCK_NUMBER`: `decimals()`, then `latestAnswer()`. Result is `parseFloat(formatUnits(answer, decimals))`.
3. For each loan:
   - `maturity < Date.now()` → unhealthy.
   - Otherwise `health = parseFloat(collateralAmount) * ethPrice / parseFloat(principal)`. If below the threshold → unhealthy. (Ignores the collateral token type, interest and repaidAmount; parity.)
4. If there are unhealthy loans: POST `/internal/liquidate-loans {loanIds}`, read `liquidated`.
5. Return `"checked=N unhealthy=M liquidated=K ethPrice=P"`.

HTTP calls: 2 confidential + 2 EVM reads.

---

## 4. Server-side internal endpoints the workflows depend on

Specified fully in [BACKEND.md](BACKEND.md):
- `/internal/expire-proposals`
- `/internal/pending-intents`
- `/internal/record-match-proposals`
- `/internal/pending-transfers`
- `/internal/confirm-transfers`
- `/internal/check-loans`
- `/internal/liquidate-loans`

## 5. CRE keypair

- Ghost CRE public key (compressed secp256k1): `020c8353f6e6d21f3aaa5f990bac838d5eaacfaac9d255c274163b73a26afd4aa3`. **Do not reuse.** Its private key is a Ghost secret.
- Noctrum: generate a new keypair, for example:
  ```bash
  bun -e 'import {PrivateKey} from "eciesjs"; const k=new PrivateKey(); console.log("priv",Buffer.from(k.secret).toString("hex")); console.log("pub",k.publicKey.toHex(true))'
  ```
  ✅ Verified 2026-10-06 (eciesjs 0.4.17): `PrivateKey.fromHex(priv).publicKey.toHex(true)` returns the compressed key, and encrypt/decrypt round-trips.
  The Noctrum keypair was generated with `cast wallet new` (same secp256k1 curve). Public key: see `deployments/monad-testnet.json` `crePublicKey`; private key in `.secrets/monad-testnet.env` (gitignored).
- Store the private key in the DON as `CRE_PRIVATE_KEY`. Put the public key in the server `CRE_PUBLIC_KEY`, the client `NEXT_PUBLIC_CRE_PUBLIC_KEY`, the TG bot `CRE_PUBLIC_KEY`, and the Raycast/e2e constants.

## 6. Sepolia → Monad diff summary

| File | Change |
|---|---|
| `project.yaml` | Sepolia RPC → monad-testnet RPC (optional, unused) |
| `secrets.yaml` | Unchanged keys. Namespace in code → `noctrum-protocol` |
| `*/config.*.json` | `ghostApiUrl` → `noctrumApiUrl` + new host. execute-transfers: externalApiUrl, vaultAddress, chainId 10143 |
| `*/main.ts` | Rename Config key, log strings ("settle-loans triggered" stays), namespace. Optional D-2 fix |
| `contracts/abi/*` | Unchanged |
| `test-ecies.ts`, `main.test.ts` | `test-ecies.ts` copied. Ghost's stale "Hello world" `main.test.ts` files were **replaced in T4.2** with real tests (`bun test` in each workflow; 19 + 11 + 8) |

## 7. Commands

```bash
# install (each workflow)
cd noctrum-settler/settle-loans && bun install      # runs cre-setup postinstall
cd ../execute-transfers && bun install
cd ../check-loans && bun install

# env for simulation: noctrum-settler/.env (gitignored *.env)
#   INTERNAL_API_KEY=...  POOL_PRIVATE_KEY=...  CRE_PRIVATE_KEY=...
#   CRE_ETH_PRIVATE_KEY=<any 32-byte hex; only needed for chain writes (none)>

# simulate (from noctrum-settler/). staging-settings needs deployed hosts (D-9);
# use --target=local-settings against server :8080 + vault-api :8081 (✅ T5.4, TESTING §3)
cre workflow simulate ./settle-loans      --target=staging-settings --non-interactive --trigger-index=0
cre workflow simulate ./execute-transfers --target=staging-settings --non-interactive --trigger-index=0
cre workflow simulate ./check-loans       --target=staging-settings --non-interactive --trigger-index=0

# compile only (✅ verified CLI v1.37.0, T4.1): writes <wf>/binary.wasm (gitignored)
cre workflow build ./settle-loans --target=staging-settings --non-interactive

# deploy (requires CRE account + early-access deploy rights)  ⚠️ VERIFY current CLI syntax: `cre workflow deploy --help`
cre login
cre secrets create ./secrets.yaml --target=production-settings     # ⚠️ VERIFY command name
cre workflow deploy ./settle-loans      --target=production-settings
cre workflow deploy ./execute-transfers --target=production-settings
cre workflow deploy ./check-loans       --target=production-settings
```
The simulator cannot load hyphenated env names; use `INTERNAL_API_KEY` locally (Ghost `tasks/demo-tweaks.md` §4).
