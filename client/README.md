# NOCTRUM client

The NOCTRUM web app: lend, borrow, swap, bridge and manage private vault balances on Monad Testnet (chain 10143). Next.js 16, React 19, Privy, ethers 6, Wormhole SDK, Tailwind 4, shadcn.

## Getting Started

```bash
bun install
cp .env.example .env.local   # set NEXT_PUBLIC_PRIVY_APP_ID
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app talks to the NOCTRUM server (`NEXT_PUBLIC_NOCTRUM_API_URL`, default `http://localhost:8080`) and `noctrum-vault-api` (`NEXT_PUBLIC_NOCTRUM_VAULT_API_URL`, default `http://localhost:8081`). `next.config.ts` rewrites `/api/v1` and `/health` to `NOCTRUM_API_ORIGIN` and `/external` to `NOCTRUM_VAULT_API_URL`. Lend rates are encrypted in the browser with `NEXT_PUBLIC_CRE_PUBLIC_KEY`.

Chain, token and vault addresses are in `src/lib/constants.ts`. The bridge brings funds to Monad Testnet from other testnets (Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia and more) via Wormhole; the list is in `src/lib/wormhole.ts`.

## Build

```bash
bun run build
```
