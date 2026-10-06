# Noctrum — Frontend Specification

This covers three user-facing frontends plus two non-web clients: `client/` (the dApp), `frontend/` (the marketing site), `docs/` (Docusaurus), `noctrum-tg/` and `noctrum-raycast/`. The bot and Raycast specs are summarised here; their server-side pieces are in BACKEND.md.

---

## 1. `client/` — dApp

### 1.1 Stack (copy exactly)
`package.json`:
- next 16.1.6, react / react-dom 19.2.3, `reactCompiler: true` (babel-plugin-react-compiler 1.0.0)
- `@privy-io/react-auth` ^3.16.0, ethers ^6.16.0, eciesjs ^0.4.17
- `@wormhole-foundation/sdk` + `sdk-evm` ^1.0.0 (⚠️ upgrade needed for MonadTestnet)
- motion ^12.35.1, recharts ^3.7.0, radix-ui ^1.4.3, lucide-react ^0.576.0, next-themes, clsx, tailwind-merge, class-variance-authority
- Tailwind 4 + @tailwindcss/postcss, tw-animate-css, shadcn (style new-york, baseColor neutral, cssVariables, lucide icons)

Fonts: Poppins (100–900) bound to `--font-geist-sans`.

### 1.2 Routing
| Route | File | Component |
|---|---|---|
| `/` | `app/page.tsx` | `StakePage` (tabs Borrow / Lend / Swap / Status) |
| `/explore` | `app/explore/page.tsx` | `ExplorePage` |
| `/explore/[ticker]` | `app/explore/[ticker]/page.tsx` | `PoolDetailPage`. An invalid ticker redirects to `/explore`. Valid tickers come from `COINS` (→ `nUSD`, `nETH`) |
| `/infinity` | `app/infinity/page.tsx` | `InfinityPage` (navbar label **"Dungeon"**). The Footer hides itself on this route |
| `/profile` | `app/profile/page.tsx` | `ProfilePage` |

Layout (`app/layout.tsx`): `PrivyProviderWrapper` → `ThemeProvider (class, system default)` → `CoreLayout` (Navbar, PageTransition, Footer).
Metadata: title "Noctrum Finance", description "Noctrum Protocol — Private P2P Lending on Chainlink CRE".

### 1.3 Next.js rewrites (`next.config.ts`)
| Source | Ghost destination | Noctrum destination |
|---|---|---|
| `/api/v1/:path*` | `http://localhost:3000/api/v1/:path*` | `${NOCTRUM_API_ORIGIN}/api/v1/:path*` (Ghost hard-codes localhost; keeping localhost is parity, D-15) |
| `/health` | `http://localhost:3000/health` | same pattern |
| `/external/:path*` | `https://convergence2026-token-api.cldev.cloud/:path*` | `${NOCTRUM_VAULT_API_URL}/:path*` |

Note: `lib/ghost.ts` calls `${SERVER}${path}` where `SERVER = NEXT_PUBLIC_GHOST_API_URL || "http://localhost:8080"`. Vault-API calls use the relative `/external/...` (rewrite).

### 1.4 `lib/constants.ts` (Ghost → Noctrum)
| Constant | Ghost | Noctrum |
|---|---|---|
| `RPC_URL` | `https://ethereum-sepolia-rpc.publicnode.com` | `https://testnet-rpc.monad.xyz` |
| `SERVER` | env `NEXT_PUBLIC_GHOST_API_URL` or `http://localhost:8080` | env `NEXT_PUBLIC_NOCTRUM_API_URL` or `http://localhost:8080` |
| `EXTERNAL_API` | CPT URL | `NEXT_PUBLIC_NOCTRUM_VAULT_API_URL` (constant only; calls go through `/external`) |
| `VAULT_ADDRESS` | `0xE588…2d13` | `<NoctrumVault>` ⚠️ after deploy |
| `CHAIN_ID` | 11155111 | 10143 |
| `gUSD`, `gETH` | Sepolia addrs | rename `nUSD`, `nETH` (Monad addrs) |
| `CRE_PUBKEY` | env `NEXT_PUBLIC_CRE_PUBLIC_KEY` or Ghost key | env or the **new** Noctrum key |
| `POOL_ADDRESS` | runtime from `/health` | same |
| `ERC20_ABI`, `VAULT_ABI` | approve/balanceOf/transfer; deposit/withdrawWithTicket | same |
| `GHOST_DOMAIN` | `{name:"GhostProtocol", version:"0.0.1", chainId, verifyingContract: VAULT_ADDRESS}` | `NOCTRUM_DOMAIN` `{name:"NoctrumProtocol", …}` |
| `EXTERNAL_DOMAIN` | `{name:"NoctrumPrivateToken", version:"0.0.1", chainId, verifyingContract: VAULT}` | name per D-5 |
| Typed data sets | BORROW, PRIVATE_TRANSFER, CONFIRM_DEPOSIT, CANCEL_LEND, CANCEL_BORROW, REPAY_LOAN, CLAIM_EXCESS_COLLATERAL, WITHDRAW, BALANCE | identical field lists |
| `COINS` | `[{gUSD,"Ghost USD"},{gETH,"Ghost ETH"}]` | `[{nUSD,"Noctrum USD"},{nETH,"Noctrum ETH"}]` |
| `SWAP_POOL_ADDRESS` | `0xF683c97a1072e4C41ae568341141b7553d40B08B` | `<NoctrumSwapPool>` |
| `SWAP_POOL_ABI` | swap / getAmountOut / poolBalance | same |

Also: `lib/ghost.ts` → `lib/noctrum.ts` (exports ts, toWei, encryptRate, post, get, privateTransfer, fetchPrivateBalances, requestWithdrawTicket). `lib/pool-utils.ts` (getTokenMeta → `/${ticker.toLowerCase()}.png`, formatTokenAmount, computePoolStats). `lib/utils.ts` (`cn`). `lib/wormhole.ts`.

### 1.5 Wallet & chain config
`components/providers/privy-provider.tsx`:
- appId `NEXT_PUBLIC_PRIVY_APP_ID`
- appearance dark, accent `#4f46e5`
- loginMethods `["wallet"]`
- Ghost: `defaultChain: sepolia`, `supportedChains: [sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, avalancheFuji, polygonAmoy, bscTestnet]`
- Noctrum: `defaultChain: monadTestnet`, `supportedChains: [monadTestnet, sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, avalancheFuji, polygonAmoy, bscTestnet]` (Sepolia kept as a bridge source, D-8)

Every write action:
1. `wallet.switchChain(CHAIN_ID)`
2. `new ethers.BrowserProvider(await wallet.getEthereumProvider())`
3. `getSigner()`
4. Actions use `wallets[0]`.

### 1.6 Pages & components (behaviour)

**StakePage** (`components/stake/StakePage.tsx`): a `TabSwitcher` with ["Borrow","Lend","Swap","Status"] and a motion `layoutId="tab-pill"` pill. Headings, with copy rebranded:

| Tab | Title | Description |
|---|---|---|
| Borrow | "Borrow with Privacy" | "Submit a private borrow intent. Your max rate is encrypted and only revealed inside the CRE settlement engine." |
| Lend | "Lend privately on NOCTRUM" (Ghost: "Lend privately on GHOST") | "Set your rate, deposit funds. Rates are sealed — only matched inside CRE confidential compute." |
| Swap | "Swap & Bridge" | "Swap tokens on-chain or bridge from other chains via Wormhole." |
| Status | "Your Positions" | "Track your active intents, loans, and payouts in real time." |

**LendCard**: see PRD F1/F2.
- Status labels:
  - approving: "Approving token spend..."
  - depositing: "Depositing into vault..."
  - initializing: "Initializing lend intent..."
  - transferring: "Private transferring to pool..."
  - confirming: "Confirming lend intent..."
  - done: "Lend intent published!"
  - error: "Something went wrong"
- Button "Publish Lend Intent" / "Connect Wallet", background `#e2a9f1`.
- List "Your Lend Intents" with Cancel.
- `friendlyError` maps ACTION_REJECTED/4001 → "Transaction rejected", INSUFFICIENT_FUNDS → "Insufficient funds", and truncates other messages to 120 chars.

**BorrowCard**: PRD F3.
- Status labels:
  - approving: "Approving token spend..."
  - depositing: "Depositing collateral into vault..."
  - transferring: "Private transferring collateral to pool..."
  - submitting: "Submitting borrow intent..."
  - done: "Borrow intent submitted!"
- `RollingNumber` animated input.
- Max-rate placeholder "10", duration default "30".
- Rows: Credit Tier, Collateral Ratio, ETH Price.
- Button "Submit Borrow Intent". List "Your Borrow Intents".
- Comment "Ensure wallet is on Sepolia" → "…on Monad Testnet".

**Swap tab** (`components/info/InfoTab.tsx`, exported as SwapTab):
- Source chain selector over `CHAINS`, index 0 = home chain.
- Home: ERC20 balance shown, quote via `/api/v1/swap-quote` (800 ms debounce), `minOut = quote×99/100`, approve the exact amountIn, then `pool.swap`. Notification "Swap Complete".
- Other chain: bridge via Wormhole `executeBridge`. Statuses initiating/attesting/redeeming. Notification "Bridge Complete" / "Bridged X from <chain> to Monad Testnet".
- `GHOST_TOKENS` → `NOCTRUM_TOKENS`. `isSepolia` → `isHomeChain`.

**StatusTab**: loads borrower-status + lender-status. Sections for borrow intents (badge pending/proposed; Cancel only when pending), lend intents (Cancel), loans as borrower (Repay, Claim excess), loans as lender. Repay signs `Repay Loan` with `amount = loan.totalDue` and **does not move funds** (parity).

**ExplorePage / HeroSection / FeaturedCarousel / FilterBar / PoolTable(Row)**:
- Data from `GET /api/v1/internal/pending-intents` (counts per token).
- Explore table quirk: the nETH row shows lendIntents 0 and counts only nETH borrows (`ExplorePage.tsx:37-38`). Keep.
- Network filter `["All Networks","Monad Testnet"]`.
- Hero title "Explore NOCTRUM Pools".
- Badges "Sepolia" → "Monad Testnet".

**PoolDetailPage** (`explore/pool-detail/*`): PoolHeader (badge network), PoolCharts (recharts), RateModelPanel (copy "NOCTRUM uses a sealed-bid tick auction…"), ReserveStatus, SupplyBorrowInfo, YourPosition (uses lender/borrower status), PoolActionButtons.

**ProfilePage**: fetches credit-score + borrower-status + lender-status. ProfileHeader (avatar from `/pfp/1-3.jpg`, network badge, explorer link `https://sepolia.etherscan.io/address/${address}` → `${EXPLORER_URL}/address/${address}`, uses Math.random for decorative values), ProfileStats, ProfileCharts, ProfilePositions (repay), WithdrawCard (PRD F13).

**InfinityPage** sections: InfinityHero (stat `{value:"Sepolia", label:"Testnet Live"}` → `"Monad"`), UpgradedSection (partners `["Chainlink","Sepolia","EIP-712","eciesjs"]` → `["Chainlink","Monad","EIP-712","eciesjs"]`), IntegrationsSection, YieldSourcesSection, ProvenSection (svg gradient id `ghostGrad` → `noctrumGrad`), LearnMoreSection, FAQSection, StakeCard ("Sepolia Testnet" → "Monad Testnet"). `SecuritySection.tsx` is an empty file (0 lines); copy it as empty.

**Navbar**:
- Items Home `/`, Explore `/explore`, Dungeon `/infinity`, Profile `/profile`.
- External menu: Research `#`, Litepaper `#`, Docs `#`, Careers (Notion URL, ⚠️ replace), "Dark Dimension" (comingSoon).
- Logo `/ghost-logo1.png` → `/noctrum-logo1.png`, alt "Noctrum".
- Notification bell via `useNotifications`. Logout.

**Footer**: FAQ copy, e.g. "NOCTRUM currently supports nUSD for lending/borrowing and nETH as collateral, operating on Monad Testnet via the Noctrum private vault." ⚠️ Ghost said "via the Chainlink Compliant Private Transfer vault". That is no longer true on Monad, so the copy must change (D-1).

**useNotifications** (`hooks/useNotifications.ts`):
- `POLL_INTERVAL 10_000`
- `STORAGE_KEY "ghost_notifications"` → `"noctrum_notifications"`
- `NOTIF_EVENT "ghost:notification"` → `"noctrum:notification"`
- Max 50 stored
- `pushNotification` export

Unused legacy components (copy for 1:1, not routed): `stake/tabs/{StakeTab,SwapTab,MigrateTab,UnstakeTab}`, `stake/{StakeCard,StakeMethodSelector,StatsDisplay,PriceInfo,TokenInput}`, `explore/data/mockData.ts` (types + featuredPools).

### 1.7 Wormhole (`lib/wormhole.ts`)
- `wormhole("Testnet", [evm])`.
- `CHAINS` (Ghost): Sepolia 11155111, BaseSepolia 84532, ArbitrumSepolia 421614, OptimismSepolia 11155420, Avalanche (Fuji) 43113, Polygon (Amoy) 80002, Bsc 97, each with logo, explorer and native symbol.
- Noctrum: prepend `{ id: "MonadTestnet", label: "Monad Testnet", logo: "/chains/monad.png" (new asset), explorer: EXPLORER_URL, chainId: 10143, nativeSymbol: "MON" }` as index 0. Keep Sepolia as a source. `dstChain: "MonadTestnet"`.
- Transfer: native token, automatic=false, `fetchAttestation(600_000)`.

### 1.8 Styling and branding
- `app/globals.css`: shadcn neutral tokens (oklch), `--radius 0.625rem`. No Ghost-specific tokens (0 "ghost" matches).
- Accent colours used inline: `#e2a9f1` (CTA), `#4f46e5` (Privy), emerald/indigo/red status colours. Keep.
- Keep the shadcn `badge` variant named `ghost` (generic UI term; **do not rename**).
- Assets to replace: `public/ghost-logo.png`, `ghost-logo1.png`, `logo*.png`, `banner.png`, `gusd.png` → `nusd.png`, `geth.png` → `neth.png`, `app/favicon.ico`. Add `public/chains/monad.png`.

---

## 2. `frontend/` — marketing site

Stack: Next ^15.1, React 19, framer-motion ^11.15, lenis ^1.3.18 (smooth scroll), lucide-react, Tailwind 4.

Sections (`src/components`): Announcement, Navbar, Hero, Features, Partners, TokenBanner, FollowAlong ("Access Noctrum directly via our Telegram bot."), Newsletter ("Stay updated on Noctrum Protocol."), CtaBanner, Footer, SmoothScroll.

Background media: `bgvid.mp4`, `bgvid1.mp4`, `video.mp4`, `bgimg.jpg`, `bg-purple.png`, `test-bg-*`, `thumbnail1-4.png`, `wormhole.png`, `Hero Text.png`, `SEO-BANNER.png`.

SEO (`app/layout.tsx`):
- metadataBase `https://ghost-finance.xyz` → ⚠️ new domain
- title default "Noctrum Finance: Private P2P Lending on Chainlink CRE", template "%s | Noctrum Finance"
- keywords include "Noctrum Finance", "Noctrum Protocol"
- authors/creator/publisher "Noctrum Finance"
- OG/Twitter images
- canonical

Also `manifest.ts` (name "Noctrum Finance", short_name "Noctrum"), `robots.ts`, `sitemap.ts`.

`src/constants/links.ts` (all ⚠️ new values):
- app, lend, borrow: `https://app.ghost-finance.xyz/`
- raycast: `https://github.com/snehendu098/ghost/tree/main/ghost-raycast`
- careers: Notion URL
- docs, litepaper, blog: `https://docs.ghost-finance.xyz/`
- tokenomics: `…/protocol/tokenomics`
- discord: `https://discord.gg/5JYesEts7j`
- telegram: `https://t.me/ghostfinancetg_bot`

Assets: `GHOST-banner.png`, `Ghost-footer.png`, `ghost-logo1.png`, `ghost-purple-paper.png`, `gusd.png`, `geth.png`, `logo*.png` → Noctrum equivalents.

## 3. `docs/` — Docusaurus 3.9.2
- Config: title "Ghost Finance Docs" → "Noctrum Finance Docs". tagline unchanged. url `https://ghost-protocol.finance` → ⚠️. org `ghost-protocol` / project `ghost` → ⚠️. GitHub links.
- Content tree:
  - `introduction`
  - `protocol/{architecture,privacy-model,tokenomics,trust-model}`
  - `mechanics/{collateral-system,matching-engine,sealed-bid-auctions,tick-based-rates}`
  - `incentives/{credit-tiers,liquidation,rejection-penalty}`
  - `api/{authentication,borrower-endpoints,internal-endpoints,lender-endpoints}`
  - `cre-workflows/{overview,settle-loans,execute-transfers,check-loans}`
  - `data-models/{state-schema,transfer-reasons}`
  - `development/{cre-simulation,e2e-testing,running-locally}`
  - `smart-contracts/{ghost-vault→noctrum-vault,on-chain-custody}`
  - `tools/{raycast-extension,telegram-bot}`
  - `zk-vault/{ascv-overview,pedersen-commitments,zk-circuits}`
- Replace every Sepolia fact with Monad, every CPT reference with the Noctrum vault, and every address.

## 4. Telegram bot UX (`noctrum-tg/`)
Commands, inline menus and callback ids are identical (see `ghost-tg/README.md` command table and `src/commands/*`). Copy changes:
- "GHOST Finance" → "NOCTRUM Finance"
- welcome text "Private P2P lending with encrypted rates powered by Chainlink CRE…" (unchanged)
- gas error "Not enough ETH for gas fees … Get Sepolia ETH from a faucet first." → "Not enough MON … Get Monad Testnet MON from https://faucet.monad.xyz". `MIN_GAS_WEI 0.001` ⚠️ D-16; Monad's min base fee is 100 gwei, so a 100k-gas tx costs ≥ 0.01 MON.
- WalletConnect metadata `{name:"GHOST Protocol", description:"Private P2P Lending on Sepolia", url:"https://ghost.protocol"}` → `{name:"NOCTRUM Protocol", description:"Private P2P Lending on Monad", url: ⚠️}`.
- `/balance` shows "ETH" for gas → "MON".
- `welcome-banner.png` replaced.

## 5. Raycast UX (`noctrum-raycast/`)
- `package.json`: name "ghost" → "noctrum", title "GHOST Protocol" → "NOCTRUM Protocol", description, author ⚠️, single command `ghost` → `noctrum` (file `src/noctrum.tsx`).
- Menu sections: Wallet / Balances / Lending / Borrowing / Loans / Privacy / Funds, with items as in `ghost.tsx`.
- `lib/constants.ts`: `GHOST_SERVER_URL "http://localhost:8080"` → `NOCTRUM_SERVER_URL` (README says prod is `https://do.roydevelops.tech/ghost-server`), RPC, CHAIN_ID, VAULT, EXTERNAL_API, tokens, domains.
- LocalStorage key `"ghost-wallet-pk"` → `"noctrum-wallet-pk"`.
- Assets: `extension-icon.png`, `gusd.png`/`geth.png`, `ethereum.png` (chain icon → monad), list-icons (keep).

## 6. UI copy change table (summary)
See REBRAND.md §4 for the exhaustive casing map. Chain copy: "Sepolia" / "Sepolia testnet" / "Sepolia Testnet" → "Monad Testnet". "ETH" for gas → "MON". "etherscan" → MonadVision/Monadscan.
