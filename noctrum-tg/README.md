# GHOST Finance — Telegram Bot

Telegram interface for [GHOST Protocol](https://github.com/ghost-protocol) — private P2P lending with encrypted rate discovery powered by Chainlink CRE.

Lend, borrow, swap, and manage private vault balances directly from Telegram. Rates are encrypted client-side using secp256k1 and only decrypted inside Chainlink's Confidential Computing Environment — the server never sees your rates.

---

## Features

- **Multi-wallet support** — Create embedded wallets, import private keys, or connect external wallets via WalletConnect (MetaMask, Phantom, Trust Wallet, Rainbow)
- **Private lending** — Deposit tokens and publish lend intents with encrypted interest rates
- **Collateralized borrowing** — Post collateral and submit borrow intents with encrypted max rate caps
- **Automated matching** — CRE matches lenders and borrowers at optimal rates; accept or reject proposals from Telegram
- **Loan lifecycle** — Repay loans, claim excess collateral, track credit score progression
- **On-chain swaps** — Swap between gUSD and gETH through an on-chain AMM pool
- **Private transfers** — Move tokens between vault accounts with EIP-712 signed authorization
- **Real-time alerts** — Poll-based notifications for new proposals, settlements, and payouts

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Bot Framework | [grammY](https://grammy.dev) |
| Blockchain | [ethers.js](https://docs.ethers.org/v6/) v6 on Sepolia |
| Encryption | [eciesjs](https://github.com/nicknisi/eciesjs) (secp256k1 ECIES) |
| Wallet Connect | [@walletconnect/sign-client](https://docs.walletconnect.com/) v2 |
| Auth | EIP-712 typed data signatures on every action |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A running GHOST API server (see `../server/`)

### Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your values (BOT_TOKEN is required)

# Start the bot
bun run start

# Or with hot reload for development
bun run dev
```

### Environment Variables

| Variable | Description | Required |
|----------|------------|----------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | Yes |
| `GHOST_API_URL` | GHOST server endpoint | No (defaults to `http://localhost:8080`) |
| `EXTERNAL_API_URL` | Vault/token API endpoint | No |
| `RPC_URL` | Sepolia JSON-RPC endpoint | No (defaults to publicnode) |
| `CRE_PUBLIC_KEY` | CRE secp256k1 public key for rate encryption | No |
| `VAULT_ADDRESS` | External vault contract address | No |
| `CHAIN_ID` | EVM chain ID | No (defaults to `11155111`) |
| `WC_PROJECT_ID` | WalletConnect Cloud project ID | No |

---

## Project Structure

```
src/
├── index.ts              # Bot entry point — setup + start
├── config.ts             # Environment variables + defaults
├── constants.ts          # ABIs, EIP-712 domains & typed data
├── api.ts                # GHOST API + external vault API clients
├── wallet.ts             # Wallet persistence, cache, signer management
├── wc.ts                 # WalletConnect v2 integration + WCSigner
├── notifier.ts           # Real-time settlement notification poller
├── ui.ts                 # Shared keyboards, HTML escaping, message helpers
├── middleware.ts          # Wallet requirement guard
└── commands/
    ├── index.ts          # Composer barrel — wires all command modules
    ├── start.ts          # /start — welcome screen + wallet detection
    ├── wallet.ts         # Wallet CRUD — create, import, WC, export, disconnect
    ├── lend.ts           # /lend, /cancel_lend, /lender_status
    ├── borrow.ts         # /borrow, /cancel_borrow, /borrower_status, proposals
    ├── loans.ts          # /active_loans, /repay, /claim_collateral
    ├── transfer.ts       # /send (private), /withdraw (vault → on-chain)
    ├── swap.ts           # /swap, /swap_quote (gUSD ↔ gETH)
    ├── info.ts           # /balance, /private_balance, /credit_score, /price, /pool_status
    └── help.ts           # /help, /alerts_on, /alerts_off
```

---

## Commands

### Wallet

| Command | Description |
|---------|------------|
| `/start` | Welcome screen with wallet detection |
| `/create_wallet` | Generate a new embedded wallet |
| `/import_wallet <key>` | Import a private key (message auto-deleted) |
| `/wallet` | View wallet address and type |
| `/export_key` | Reveal private key (spoiler text) |
| `/disconnect` | Remove connected wallet |

### Lending

| Command | Description |
|---------|------------|
| `/lend <amount> <token> <rate%>` | 4-step lend flow with encrypted rate |
| `/cancel_lend <slotId>` | Cancel and reclaim funds |
| `/lender_status` | View active lends, earning loans, pending payouts |

### Borrowing

| Command | Description |
|---------|------------|
| `/borrow <amt> <token> <collateral> <collToken> <maxRate%>` | 4-step borrow with encrypted max rate |
| `/cancel_borrow <intentId>` | Cancel and reclaim collateral |
| `/borrower_status` | View intents, proposals, active loans |
| `/accept_proposal <id>` | Accept a match — funds disbursed |
| `/reject_proposal <id>` | Reject — 5% collateral slashed |

### Loans

| Command | Description |
|---------|------------|
| `/active_loans` | View all loans (as borrower + lender) |
| `/repay <loanId>` | 3-step full loan repayment |
| `/claim_collateral <loanId>` | Withdraw excess collateral |

### Swap & Transfer

| Command | Description |
|---------|------------|
| `/swap <amount> <from> <to>` | On-chain swap (5% slippage tolerance) |
| `/swap_quote <amount> <from> <to>` | Get price quote |
| `/send <address> <amount> <token>` | Private vault-to-vault transfer |
| `/withdraw <amount> <token>` | Vault to on-chain withdrawal |

### Info & Alerts

| Command | Description |
|---------|------------|
| `/balance` | On-chain balances (gUSD, gETH, ETH) |
| `/private_balance` | Private vault balances |
| `/credit_score` | Credit tier + collateral multiplier |
| `/collateral_quote <amt> <token> <collToken>` | Required collateral calculator |
| `/price` | Live ETH/USD price |
| `/pool_status` | Protocol stats (pending intents) |
| `/alerts_on` | Enable real-time settlement notifications |
| `/alerts_off` | Disable notifications |

---

## Architecture

### How Lending Works

```
User → /lend 500 gUSD 5
  ├─ Step 1: Approve gUSD on vault contract
  ├─ Step 2: Deposit gUSD into vault
  ├─ Step 3: Private transfer to GHOST pool
  └─ Step 4: Sign EIP-712 confirmation with encrypted rate → API
```

The rate (`5%`) is encrypted with the CRE's secp256k1 public key before leaving the client. The GHOST server stores the ciphertext — only the Chainlink CRE workflow can decrypt and match rates.

### Wallet Types

| Type | Key Storage | Signing |
|------|------------|---------|
| **Embedded** | Private key in `data/wallets/{userId}.json` | Direct ethers.Wallet |
| **Imported** | User-provided key in same file format | Direct ethers.Wallet |
| **Connected** | No key stored — session reference only | WalletConnect RPC calls |

### Security

- Private keys for embedded/imported wallets are stored locally in `data/wallets/`
- Import messages are auto-deleted from Telegram chat
- Private keys displayed as Telegram spoiler text
- All user-facing actions require EIP-712 typed data signatures
- Rate encryption uses ECIES (secp256k1) — server is "dumb storage"
- HTML output is escaped to prevent injection

---

## Development

```bash
# Hot reload
bun run dev

# Type check
bunx tsc --noEmit

# Add a new command module
# 1. Create src/commands/myfeature.ts using Composer pattern
# 2. Import and .use() it in src/commands/index.ts
```

### Adding a New Command

```typescript
// src/commands/myfeature.ts
import { Composer } from "grammy";
import { requireWallet } from "../middleware";

const composer = new Composer();

composer.command("mycommand", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  // ... your logic
});

export default composer;
```

Then register it in `src/commands/index.ts`:

```typescript
import myfeature from "./myfeature";
commands.use(myfeature);
```

---

## License

Part of the GHOST Protocol. See root repository for license details.
