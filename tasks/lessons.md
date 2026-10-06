# Lessons

## CRE SDK Import Paths
- Everything imports from `@chainlink/cre-sdk` — NO subpath exports like `/capabilities/...`
- Use `cre.capabilities.HTTPClient()`, `cre.handler()`, `cre.capabilities.CronCapability()`
- HTTP helpers: `ok`, `json`, `text` all from main package

## CRE HTTP Request Pattern (DON mode)
- `HTTPClient.sendRequest(runtime, fn, consensusAgg)(...args).result()`
- Callback fn receives `HTTPSendRequester` — use `sendRequester.sendRequest({...}).result()`
- Body for POST: `Buffer.from(str).toString('base64')` (protobuf bytes → base64 string in JSON form)
- Headers: simple `headers: Record<string, string>` works (deprecated but functional), or use `multiHeaders`
- Handler signature: `(runtime: Runtime<Config>, _payload: CronPayload): string`

## CRE Workflow Setup
- Each workflow needs `bun install` in its directory (has own package.json)
- Config goes in `config.staging.json` co-located with `main.ts`
- Simulate from project root: `cre workflow simulate ./workflow-name --target=staging-settings`

## CRE WASM Runtime Compatibility
- **eciesjs v0.4** — WORKS in QuickJS WASM. Uses @noble/secp256k1 (pure JS). Can decrypt rates inside CRE.
- **viem v2** — WORKS in QuickJS WASM. EIP-712 signTypedData feasible inside CRE.
- **@noble/hashes** — WORKS (confirmed by test workflow using sha256/hmac)
- Buffer, TextEncoder, TextDecoder, crypto.randomUUID all available

## Server tsconfig
- No target set → defaults ES3 → BigInt/Map iteration errors. Pre-existing, bun handles at runtime.

## Naming Conventions
- Config vars should be clear and direct: `GETH_ADDRESS` not `COLLATERAL_TOKEN_ADDRESS`. Don't over-abstract when there are only two known tokens.
