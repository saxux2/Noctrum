# Noctrum — Rebrand Map (Ghost → Noctrum)

Ghost has ~780 case-insensitive "ghost" occurrences: server 50, settler 18, client 77, frontend 73, tg 84, raycast 36, e2e 17, contracts 39, docs 148, reference-docs 232, tasks 5.

⚠️ **Name check**: the working folder is `C:\Nocturm` ("Noct**ur**m"), but the product name requested is "Noct**ru**m". These docs use **Noctrum** everywhere. Confirm the spelling (D-19) before running any rename.

The acronym "GHOST (Generalized Heuristic for Obfuscated Settlement and Transfer)" has no Noctrum equivalent. Use "NOCTRUM" as a plain uppercase wordmark (D-19).

## 1. Casing-preserving token map

| Ghost form | Noctrum form | Example locations |
|---|---|---|
| `GHOST` | `NOCTRUM` | UI copy ("Lend privately on GHOST"), docs, `GHOST_DOMAIN`, `GHOST_TOKENS`, `GHOST_API`, `GHOST_SERVER_URL` |
| `Ghost` | `Noctrum` | "Ghost Finance", "Ghost USD", `GhostSwapPool`, `GhostProtocol` |
| `ghost` | `noctrum` | package names, files, `ghost_notifications`, `ghost-wallet-pk` |
| `gUSD` | `nUSD` ⚠️ D-6 | tokens, UI, API errors |
| `gETH` | `nETH` ⚠️ D-6 | |
| `GUSD` / `GETH` | `NUSD` / `NETH` | `GUSD_ADDRESS`, `GETH_ADDRESS`, `GUSDIcon` |
| `gusd` / `geth` | `nusd` / `neth` | image file names, `resolveToken` inputs (`"gusd","g-usd"` → `"nusd","n-usd"`) |
| `GhostProtocol` (EIP-712 name) | `NoctrumProtocol` | auth.ts, client, tg, raycast, e2e |
| `ghost-protocol` (Vault DON namespace) | `noctrum-protocol` | settler main.ts |
| `ghostApiUrl` | `noctrumApiUrl` | CRE configs and `Config` types |
| `ghostGet` / `ghostPost` | `noctrumGet` / `noctrumPost` | tg api |
| `ghostRoute` / `ghost.routes.ts` | `noctrumRoute` / `noctrum.routes.ts` | server |
| `GhostVault`, `IGhostVault`, `GhostLoanLedger`, `GhostRouter`, `GhostPolicyEngine`, `GhostMigration`, `IGhostRouter` | `Noctrum…` | interfaces + reference docs |
| `ghostGrad` | `noctrumGrad` | ProvenSection svg |
| `ghost:notification` | `noctrum:notification` | client event |
| `ghostfinance`, `_ghostfi`, `ghostfinancetg_bot`, `ghostblue` | ⚠️ new handles/colour names (D-9) | frontend/docs |

**Do NOT rename**:
- the shadcn Badge/Button variant `ghost` (`client/src/components/ui/badge.tsx:19`) and any Tailwind/shadcn "ghost" button style — this is a generic UI term
- third-party identifiers
- ~~the CPT EIP-712 domain name `CompliantPrivateTokenDemo`~~: D-5 decided to rename it to `NoctrumPrivateToken`

## 2. File and folder renames

| Ghost | Noctrum |
|---|---|
| `ghost/` (repo root) | `noctrum/` |
| `ghost-settler/` | `noctrum-settler/` |
| `ghost-tg/` | `noctrum-tg/` |
| `ghost-raycast/` | `noctrum-raycast/` |
| `transfer-demo/` | `contracts/` (D-10) |
| `transfer-demo/src/GhostSwapPool.sol` | `contracts/src/NoctrumSwapPool.sol` |
| `…/interfaces/IGhostVault.sol` | `INoctrumVault.sol` |
| `…/interfaces/IGhostLoanLedger.sol` | `INoctrumLoanLedger.sol` |
| (new) | `contracts/src/NoctrumVault.sol`, `contracts/script/00_DeployVault.s.sol` |
| (new) | `noctrum-vault-api/` |
| `server/src/routes/ghost.routes.ts` | `noctrum.routes.ts` |
| `client/src/lib/ghost.ts` | `client/src/lib/noctrum.ts` |
| `ghost-raycast/src/ghost.tsx` | `noctrum-raycast/src/noctrum.tsx` |
| `ghost-raycast/src/lib/ghost-api.ts` | `noctrum-api.ts` |
| `docs/docs/smart-contracts/ghost-vault.md` | `noctrum-vault.md` |
| `client/public/ghost-logo.png`, `ghost-logo1.png` | `noctrum-logo.png`, `noctrum-logo1.png` |
| `frontend/public/GHOST-banner.png`, `Ghost-footer.png`, `ghost-logo1.png`, `ghost-purple-paper.png` | `NOCTRUM-banner.png`, `Noctrum-footer.png`, `noctrum-logo1.png`, `noctrum-purple-paper.png` |
| `docs/static/img/ghost-logo.png`, `Ghost.png` | `noctrum-logo.png`, `Noctrum.png` |
| `*/public/gusd.png`, `geth.png`; raycast `assets/gusd.png`, `geth.png` | `nusd.png`, `neth.png` |

## 3. Package names
| Ghost | Noctrum |
|---|---|
| `server` (package.json name) | `server` (unchanged) or `noctrum-server` |
| `client` | `client` |
| `ghost-frontend` | `noctrum-frontend` |
| `ghost-tg` | `noctrum-tg` |
| Raycast `name: "ghost"`, title "GHOST Protocol", command `ghost` | `noctrum`, "NOCTRUM Protocol", command `noctrum` |
| `docs` | `docs` |
| `e2e-test` | `e2e-test` |
| CRE workflows `typescript-simple-template` | unchanged |
| CRE workflow names `settle-loans-staging` etc. | unchanged (no "ghost" in them) |

## 4. Env var / config key renames
| Ghost | Noctrum |
|---|---|
| `NEXT_PUBLIC_GHOST_API_URL` | `NEXT_PUBLIC_NOCTRUM_API_URL` |
| `GHOST_API_URL` (tg) | `NOCTRUM_API_URL` |
| `GHOST_SERVER_URL` (raycast const) | `NOCTRUM_SERVER_URL` |
| `GETH_ADDRESS` (server) | `NETH_ADDRESS` |
| `GUSD_ADDRESS`/`GETH_ADDRESS` (forge 08) | `NUSD_ADDRESS`/`NETH_ADDRESS` |
| `TOKEN_ADDRESS` (server, = gUSD) | keep `TOKEN_ADDRESS` (generic) |
| `ghostApiUrl` (CRE) | `noctrumApiUrl` |
| Mongo DB name `ghost` | `noctrum` |
| localStorage `ghost_notifications` | `noctrum_notifications` |
| Raycast LocalStorage `ghost-wallet-pk` | `noctrum-wallet-pk` |

## 5. UI text and brand strings
| Ghost | Noctrum |
|---|---|
| "Ghost Finance" | "Noctrum Finance" |
| "GHOST Protocol" / "Ghost Protocol" | "NOCTRUM Protocol" / "Noctrum Protocol" |
| "GHOST Finance — Telegram Bot" | "NOCTRUM Finance — Telegram Bot" |
| "Ghost USD" / "Ghost ETH" | "Noctrum USD" / "Noctrum ETH" |
| "Lend privately on GHOST" | "Lend privately on NOCTRUM" |
| "Explore GHOST Pools" | "Explore NOCTRUM Pools" |
| "GHOST uses a sealed-bid tick auction…" | "NOCTRUM uses …" |
| FAQ "What is Ghost Protocol?" etc. | "What is Noctrum Protocol?" etc. |
| "How Ghost Keeps Lending Private" / "Four layers … every Ghost loan" | Noctrum |
| "Learn more about Ghost", "Ghost Protocol: Private P2P Lending Explained" | Noctrum |
| "Access Ghost directly via our Telegram bot." | "Access Noctrum …" |
| "Stay updated on Ghost Protocol." | "…Noctrum Protocol." |
| "GHOST server running on port" | "NOCTRUM server running on port" |
| Docs title "Ghost Finance Docs" | "Noctrum Finance Docs" |
| Metadata description "GHOST Protocol — Private P2P Lending on Chainlink CRE" | "NOCTRUM Protocol — …" |
| Raycast description "Private P2P lending, transfers, and wallet management on GHOST Protocol" | "… on NOCTRUM Protocol" |
| WalletConnect metadata name "GHOST Protocol", url `https://ghost.protocol` | "NOCTRUM Protocol", ⚠️ url |
| Chain words "Sepolia", "Sepolia testnet" | "Monad Testnet" (see MONAD_MIGRATION) |

## 6. Assets to (re)design
Logo set (`logo.png`, `logo-2.png`, `logo-dark.png`, `logo-new.png`, `ghost-logo*.png`), `favicon.ico` (client, frontend, docs), banners (`banner.png`, `GHOST-banner.png`, `SEO-BANNER.png`, `Ghost-footer.png`, `welcome-banner.png` for TG, `docusaurus-social-card.jpg`), token icons (`gusd.png`, `geth.png`), raycast `extension-icon.png`, `ethereum.png` (as chain icon), new `chains/monad.png`, root `assets/image1.png`. Videos (`bgvid*.mp4`, `video.mp4`) may contain the Ghost brand ⚠️ check.

## 7. Allowed residual "ghost" matches after rebrand
- `client/src/components/ui/badge.tsx` variant `ghost` (and any shadcn button variant)
- `noctrum-docs/*` (this folder references Ghost as the source)
- Lockfiles referencing third-party packages, if any
- Root `CLAUDE.md` (names Ghost as the reference source, like `noctrum-docs/`)
- Vendored third-party code and gitignored build output: `contracts/lib/` (OpenZeppelin `fv/specs` ghost variables), `contracts/out/`, `client/.next/`, `docs/build/` (CSS color `GhostWhite`, BIP-39 word `ghost`)

T8.1 (2026-10-07): the check below returns only these entries.

Check command:
```bash
grep -rIni "ghost" --exclude-dir=node_modules --exclude-dir=noctrum-docs --exclude=*.lock . | grep -v "variant.*ghost\|ghost:"
```
