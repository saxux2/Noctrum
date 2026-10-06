# NOCTRUM Protocol — Claude Code instructions

Private P2P lending with sealed-bid, discriminatory-price rate discovery on Chainlink CRE, running on **Monad Testnet (chain 10143)**.
It is a 1:1 rebuild of Ghost Finance (`../ghost/`, Sepolia). Behaviour must match Ghost exactly; only the chain and the name change.

## ALWAYS
1. **Read `noctrum-docs/` before coding.** Start with BUILD_PLAN.md (find your task), then the spec file it references, then RISKS_AND_OPEN_QUESTIONS.md (decisions D-x).
2. **Build one BUILD_PLAN task per session.** Check its Deps, follow its commands, prove its AC, and stop. Do not drift into other tasks.
3. **Never guess addresses, chain selectors, feed addresses or version numbers.** Read them from `deployments/monad-testnet.json` or the docs. If a value is marked ⚠️ VERIFY, verify it (official docs or the `cre`/`cast` CLI) or ask. Never invent one.
4. **Parity first.** The Ghost code (`../ghost/`) is the source of truth. Do not "fix" Ghost behaviour unless a decision in RISKS_AND_OPEN_QUESTIONS.md says so. Put ideas in its "Later" section.
5. **Never commit secrets.** Keys live in per-package `.env` files (gitignored). Ghost committed private keys; never copy them.
6. If a 🔴 decision blocking your task is still open, stop and ask the user.

## Stack
- Bun everywhere. TypeScript.
- `server/`: Hono 4 + Mongoose 9 + ethers 6 + eciesjs 0.4. Port 8080.
- `noctrum-vault-api/`: Bun + Hono + Mongo. Port 8081. CPT-compatible private ledger, withdrawal tickets, Monad event indexer.
- `noctrum-settler/`: Chainlink CRE TS workflows (`@chainlink/cre-sdk` 1.1.x, viem, eciesjs): settle-loans 30 s, execute-transfers 15 s, check-loans 60 s.
- `contracts/`: Foundry, solc 0.8.26, via_ir, cancun. OZ 5.5, chainlink-ace v1.0.0. SimpleToken (nUSD/nETH), NoctrumSwapPool, NoctrumVault.
- `client/`: Next 16.1.6, React 19.2, Privy 3.16, ethers 6, Wormhole SDK, Tailwind 4, shadcn.
- `frontend/`: Next 15 marketing site. `docs/`: Docusaurus 3.9.2.
- `noctrum-tg/`: grammY + WalletConnect v2. `noctrum-raycast/`: Raycast extension. `e2e-test/`: Bun scripts 01–08.

## Folder structure
```
noctrum/
  CLAUDE.md
  noctrum-docs/          planning specs (read first)
  deployments/           monad-testnet.json (addresses; no secrets)
  contracts/             Foundry (src/, script/, test/, lib/)
  server/                Noctrum API (src/controllers, models, routes/noctrum.routes.ts, auth.ts, state.ts, price.ts)
  noctrum-vault-api/     private ledger service
  noctrum-settler/       project.yaml, secrets.yaml, settle-loans/, execute-transfers/, check-loans/, contracts/abi/
  client/ frontend/ docs/ noctrum-tg/ noctrum-raycast/ e2e-test/ reference-docs/
```

## Conventions (inherited from Ghost)
- BigInt for token amounts; amounts are wei strings in JSON and Mongo; addresses are lowercased before storage.
- EIP-712 typed-data auth on user endpoints. Domain `{name:"NoctrumProtocol", version:"0.0.1", chainId:10143, verifyingContract:<NoctrumVault>}`. ±5 min timestamp window.
- Fund movements are only ever **queued** `PendingTransfer`s with reasons `cancel-lend|cancel-borrow|disburse|return-collateral|repay-lender|return-collateral-repay|liquidate`, executed by CRE with the pool key.
- Rates are encrypted client-side with the CRE public key; the server is blind storage.
- CRE: import only from `@chainlink/cre-sdk` (no subpaths). `ConfidentialHTTPClient.sendRequest(runtime,{vaultDonSecrets, request}).result()`. ≤ 5 HTTP calls per execution. Handler returns a string. No `crypto` global in CRE (use `Date.now().toString(36)` ids).
- Config names are plain and direct (`NETH_ADDRESS`, not `COLLATERAL_TOKEN_ADDRESS`).
- Monad: gas is charged on the **limit**; never hard-code large gas limits. Use `forge script --slow`. Index logs with `finalized` in ≤ 100-block pages.
- Keep the shadcn `ghost` UI variant name; it is not branding.

## Commands
```bash
# server
cd server && bun install && bun run --hot src/index.ts          # curl localhost:8080/health
cd server && bun test
# vault api
cd noctrum-vault-api && bun install && bun run --hot src/index.ts
# contracts
cd contracts && forge build && forge test -vvv
forge script script/<X>.s.sol:<Name> --rpc-url $RPC_URL --broadcast --slow
forge verify-contract <addr> <path:Name> --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
# CRE (from noctrum-settler/)
cre workflow simulate ./settle-loans --target=staging-settings --non-interactive --trigger-index=0
cre workflow supported-chains --output json
# client / frontend / docs
cd client && bun install && bun run dev      # build: bun run build
cd frontend && bun run dev ; cd docs && bun run start
# bots
cd noctrum-tg && bun run dev ; cd noctrum-raycast && bun run dev
# e2e (Monad testnet; .env with keys)
cd e2e-test && bun run src/01_transfer-funds.ts   # … through 08
```

## Network
Monad Testnet:
- chainId 10143, MON
- RPC `https://testnet-rpc.monad.xyz`
- explorer `https://testnet.monadvision.com`
- faucet `https://faucet.monad.xyz`

ETH/USD price: Chainlink feed on Arbitrum One `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` (unchanged from Ghost).
