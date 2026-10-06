# NOCTRUM server

Hono API on Bun with MongoDB. It is the blind storage layer: it stores encrypted lend intents, borrow intents, proposals, loans, credit scores and the pending-transfer queue that CRE executes. It cannot decrypt rates or move funds.

To install dependencies:
```sh
bun install
```

To run (needs `TOKEN_ADDRESS` and `CRE_PUBLIC_KEY`; other variables have Monad Testnet defaults in `src/config.ts`):
```sh
bun run dev
```

open http://localhost:8080/health

To test:
```sh
bun test
```

User endpoints use EIP-712 auth with domain `NoctrumProtocol` / `0.0.1` / 10143 / NoctrumVault. `/api/v1/internal/*` endpoints require `x-api-key` when `INTERNAL_API_KEY` is set. Vault operations go to `noctrum-vault-api` (`EXTERNAL_API_URL`, default `http://localhost:8081`). See the root README and `docs/` for the endpoint list.
