# Noctrum — Environment Variables & Config Files

No real secrets here. `<…>` marks values that only exist after deployment. Each package has its own `.env` (gitignored). Every key listed was found in Ghost code, except those marked **new**.

## 0. Shared deployment registry (new)
`deployments/monad-testnet.json`, written by BUILD_PLAN task 4.x and read by humans/scripts:
```json
{
  "chainId": 10143,
  "rpc": "https://testnet-rpc.monad.xyz",
  "explorer": "https://testnet.monadvision.com",
  "NoctrumVault": "<0x…>",
  "PolicyEngineProxy": "<0x…>",
  "PolicyEngineImpl": "<0x…>",
  "nUSD": "<0x…>",
  "nETH": "<0x…>",
  "NoctrumSwapPool": "<0x…>",
  "ticketSigner": "<0x…>",
  "poolWallet": "<0x…>",
  "crePublicKey": "<02…>",
  "deployBlock": 0
}
```

## 1. `server/.env`
```dotenv
PORT=8080
MONGODB_URI=mongodb://localhost:27017/noctrum
TOKEN_ADDRESS=<nUSD>                       # required
NETH_ADDRESS=<nETH>                        # Ghost: GETH_ADDRESS
CRE_PUBLIC_KEY=<compressed secp256k1 hex>  # required
CHAIN_ID=10143
EXTERNAL_API_URL=https://vault-api.example.noctrum   # noctrum-vault-api
EXTERNAL_VAULT_ADDRESS=<NoctrumVault>
INTERNAL_API_KEY=<random 32+ chars>        # empty = internal routes open (Ghost default)
POOL_PRIVATE_KEY=                          # optional; only to expose poolAddress on /health
ARBITRUM_RPC_URL=https://arbitrum-one-rpc.publicnode.com
ETH_USD_FEED=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
```
⚠️ If `POOL_PRIVATE_KEY` is empty, `/health` returns `poolAddress = 0x000…0`. Clients would then private-transfer to the zero address. Set the key, or (D-20) add a `POOL_ADDRESS` env var instead of the key. That would be a behaviour-preserving improvement, so it belongs under "Later" unless approved.

## 2. `noctrum-vault-api/.env` (new)
```dotenv
PORT=8081
MONGODB_URI=mongodb://localhost:27017/noctrum-vault?replicaSet=rs0   # must be a replica set (ledger writes use transactions)
RPC_URL=https://testnet-rpc.monad.xyz
CHAIN_ID=10143
VAULT_ADDRESS=<NoctrumVault>
POLICY_ENGINE_ADDRESS=<proxy>
TICKET_SIGNER_PRIVATE_KEY=<hex>            # address must equal NoctrumVault.ticketSigner
EIP712_NAME=NoctrumPrivateToken           # D-5 (decided); must match NoctrumVault
EIP712_VERSION=0.0.1
START_BLOCK=<deployBlock>
LOG_RANGE=100
POLL_MS=2000
TICKET_TTL_SECONDS=3600
AUTH_WINDOW_SECONDS=300
INVARIANT_MS=60000                        # vault-holdings invariant check interval
INDEXER_ENABLED=true                      # "false" serves the API without the Monad indexer
```
Every ledger write (indexer page, transfer, withdraw) runs in a Mongo transaction, so MongoDB must be a replica set: Atlas, or `mongod --replSet rs0` (single node is fine). Tests use `MongoMemoryReplSet`.
HTTP status per error code (CPT does not document them): `bad_request`/`insufficient_balance`/`invalid_recipient` → 400, `request_auth_failed`/`request_auth_expired` → 401, `operation_denied_by_policy` → 403.

## 3. `noctrum-settler/`
`.env` (simulation only; `*.env` gitignored):
```dotenv
INTERNAL_API_KEY=<same as server>
POOL_PRIVATE_KEY=<pool wallet hex>
CRE_PRIVATE_KEY=<CRE ecies private key hex, no 0x>
CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001  # no chain writes
```
`secrets.yaml`: keep Ghost's structure (CRE_WORKFLOWS §0).

`project.yaml`: CRE_WORKFLOWS §0.

`settle-loans/config.staging.json`:
```json
{ "schedule": "*/30 * * * * *", "noctrumApiUrl": "https://api.example.noctrum/api/v1" }
```
`settle-loans/config.production.json`: same as staging (D-13: Ghost lacked `noctrumApiUrl`; completed in T4.1).

`execute-transfers/config.staging.json`:
```json
{
  "schedule": "*/15 * * * * *",
  "noctrumApiUrl": "https://api.example.noctrum/api/v1",
  "externalApiUrl": "https://vault-api.example.noctrum",
  "vaultAddress": "<NoctrumVault>",
  "chainId": 10143
}
```
`execute-transfers/config.production.json`: same as staging but `"schedule": "*/30 * * * * *"` (D-13: Ghost lacked the other fields; completed in T4.1).

`check-loans/config.staging.json`:
```json
{
  "schedule": "*/60 * * * * *",
  "noctrumApiUrl": "https://api.example.noctrum/api/v1",
  "feedChainName": "ethereum-mainnet-arbitrum-1",
  "ethUsdFeed": "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  "liquidationThreshold": 1.5
}
```
`check-loans/config.production.json`: the same but `"schedule": "*/30 * * * * *"` (D-13: Ghost pointed to `localhost:3000`; completed in T4.1).

`config.local.json` (each workflow, T5.4): same as staging but `noctrumApiUrl: "http://localhost:8080/api/v1"` and (execute-transfers) `externalApiUrl: "http://localhost:8081"`. Used by the `local-settings` target.

`workflow.yaml` (each): `staging-settings.user-workflow.workflow-name: "<name>-staging"`, `workflow-artifacts: {workflow-path: "./main.ts", config-path: "./config.staging.json", secrets-path: "../secrets.yaml"}`. Production is the same with `-production`; `local-settings` uses `<name>-local` and `./config.local.json`.

## 4. `contracts/.env` (Foundry)
```dotenv
PRIVATE_KEY=0x<deployer>
PRIVATE_KEY_2=0x<second account for 07 withdraw demo>
RPC_URL=https://testnet-rpc.monad.xyz
VAULT_ADDRESS=<NoctrumVault>               # new: replaces hard-coded constant
TICKET_SIGNER_ADDRESS=<0x…>                # new: for 00_DeployVault
TOKEN_ADDRESS=<token for 03/04/05/06/07>
POLICY_ENGINE_ADDRESS=<proxy>
MINT_TO=<optional>
WITHDRAW_AMOUNT=<wei>
TICKET=<0x… 89 bytes>
NUSD_ADDRESS=<nUSD>                        # Ghost: GUSD_ADDRESS
NETH_ADDRESS=<nETH>                        # Ghost: GETH_ADDRESS
MONADSCAN_API_KEY=<for etherscan-style verify>
```
`foundry.toml`: see CONTRACTS §0. `remappings.txt`: unchanged.

`api-scripts` (copy of Ghost's): `PRIVATE_KEY`, `PRIVATE_KEY_2`. `common.ts` constants: `API_BASE_URL`, `EIP712_DOMAIN.chainId 10143`, `verifyingContract`.

## 5. `client/.env.local`
```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=<privy app id>
NEXT_PUBLIC_NOCTRUM_API_URL=https://api.example.noctrum   # Ghost: NEXT_PUBLIC_GHOST_API_URL (default http://localhost:8080)
NEXT_PUBLIC_NOCTRUM_VAULT_API_URL=https://vault-api.example.noctrum   # EXTERNAL_API constant (default http://localhost:8081)
NEXT_PUBLIC_CRE_PUBLIC_KEY=<02…>
NOCTRUM_API_ORIGIN=https://api.example.noctrum          # next.config.ts rewrites /api/v1, /health (D-15)
NOCTRUM_VAULT_API_URL=https://vault-api.example.noctrum # next.config.ts rewrite /external
```
Deployed values (T5.6): `https://server-production-291b.up.railway.app`, `https://vault-api-production-30bb.up.railway.app`.
Constants that Ghost hard-codes in `src/lib/constants.ts` (keep them hard-coded for parity, with Monad values): `RPC_URL`, `EXTERNAL_API`, `VAULT_ADDRESS`, `CHAIN_ID`, `nUSD`, `nETH`, `SWAP_POOL_ADDRESS`.
`next.config.ts` rewrites: `/api/v1/*`, `/health` → API origin (Ghost: localhost:3000); `/external/*` → vault-api.

## 6. `frontend/`
No env. `src/constants/links.ts` holds the app/docs/social links (⚠️ new). `layout.tsx` sets metadataBase.

## 7. `docs/`
No env. `docusaurus.config.ts`: url, baseUrl `/`, organizationName, projectName, GitHub links.

## 8. `noctrum-tg/.env` (from Ghost `.env.example`)
```dotenv
BOT_TOKEN=<from @BotFather>           # required
NOCTRUM_API_URL=https://api.example.noctrum   # Ghost: GHOST_API_URL
EXTERNAL_API_URL=https://vault-api.example.noctrum
RPC_URL=https://testnet-rpc.monad.xyz
CRE_PUBLIC_KEY=<02…>
VAULT_ADDRESS=<NoctrumVault>
CHAIN_ID=10143
WC_PROJECT_ID=<walletconnect cloud id>
```
Hard-coded in `config.ts`/`constants.ts` (update values): nUSD, nETH, SWAP_POOL_ADDRESS, both EIP-712 domains (chainId + vault).

## 9. `noctrum-raycast/`
No env. Values live in `src/lib/constants.ts`: `NOCTRUM_SERVER_URL`, `RPC_URL`, `CHAIN_ID`, `VAULT_ADDRESS`, `EXTERNAL_API`, tokens, `CRE_PUBKEY`, domains, typed data (incl. `SHIELDED_ADDRESS_TYPES`, `TRANSACTION_TYPES`).

## 10. `e2e-test/.env` (Bun auto-loads)
```dotenv
PRIVATE_KEY=0x<deployer; owner of nUSD/nETH for minting>
POOL_PRIVATE_KEY=<pool wallet>     # 0x optional
LENDER_A_KEY=0x<…>
LENDER_B_KEY=0x<…>
BORROWER_KEY=0x<…>
# optional
INTERNAL_API_KEY=<server INTERNAL_API_KEY, if the server sets one>
SERVER_URL=http://localhost:8080
VAULT_API_URL=http://localhost:8081
RPC_URL=https://testnet-rpc.monad.xyz
```
`src/utils/config.ts` constants: `RPC_URL`, `SERVER` (`SERVER_URL`, default `http://localhost:8080`), `EXTERNAL_API` (`VAULT_API_URL`, default `http://localhost:8081`), `VAULT_ADDRESS`, `CHAIN_ID` (10143), `nUSD`, `nETH`, `CRE_PUBKEY`, `INTERNAL_API_KEY`, `GAS_FUNDING` (0.1 MON, D-16).

## 11. Secrets inventory (where each lives)
| Secret | Holders |
|---|---|
| CRE_PRIVATE_KEY | CRE Vault DON only (+ local .env for simulation) |
| POOL_PRIVATE_KEY | CRE Vault DON; optionally server env; e2e .env |
| INTERNAL_API_KEY | server env + CRE Vault DON |
| TICKET_SIGNER_PRIVATE_KEY | vault-api only |
| Deployer key | contracts/.env, e2e .env |
| BOT_TOKEN, WC_PROJECT_ID | tg env |
| PRIVY app id | client env (public) |

**Ghost leaked secrets (never reuse):** pool key and test-wallet keys hard-coded in `server/seed-loan.ts`, `server/scripts/*.ts`. All Ghost test wallets are compromised by definition.
