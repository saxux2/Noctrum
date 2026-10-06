---
sidebar_position: 1
title: Telegram Bot
---

# Telegram Bot

The GHOST Telegram bot (`ghost-tg`) provides a conversational interface for interacting with the protocol directly from Telegram. It supports multi wallet management, encrypted lending, collateralized borrowing, and real time notifications.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Bot Framework | grammY |
| Blockchain | ethers.js v6 on Sepolia |
| Encryption | eciesjs (secp256k1 ECIES) |
| External Wallets | WalletConnect v2 |
| Authentication | EIP 712 typed data signatures |

## Wallet Management

The bot supports three wallet types:

| Wallet Type | Description |
|-------------|-------------|
| Embedded | Generated and stored locally by the bot. Private key held in bot storage. |
| Imported | User provides an existing private key. Stored encrypted in bot storage. |
| WalletConnect | Connect an external wallet (MetaMask, Rainbow, etc.) via WalletConnect v2. Signing requests are forwarded to the external wallet. |

Users can switch between wallets at any time. All protocol operations use the currently active wallet for signing.

## Commands

### Wallet Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and wallet detection |
| `/wallet` | View active wallet, create new, import, or connect via WalletConnect |

### Lending Commands

| Command | Description |
|---------|-------------|
| `/lend` | Start a new lend intent flow (amount, rate, deposit, confirm) |
| `/cancel_lend` | Cancel an active lend intent and reclaim funds |
| `/lend_status` | View all active lend positions |

### Borrowing Commands

| Command | Description |
|---------|-------------|
| `/borrow` | Start a new borrow intent flow (amount, collateral, max rate) |
| `/cancel_borrow` | Cancel a pending borrow intent |
| `/proposals` | View and respond to match proposals |
| `/borrow_status` | View all borrow positions and proposals |

### Loan Management

| Command | Description |
|---------|-------------|
| `/loans` | View all active loans |
| `/repay` | Repay an active loan in full |
| `/claim_collateral` | Claim excess collateral from an overcollateralized position |

### Transfers and Swaps

| Command | Description |
|---------|-------------|
| `/transfer` | Execute a private transfer to another shielded address |
| `/withdraw` | Withdraw funds from the vault to an on chain address |
| `/swap` | Swap between gUSD and gETH with live quotes |

### Information

| Command | Description |
|---------|-------------|
| `/balances` | View private vault balances and on chain balances |
| `/credit` | View credit score, tier, and collateral multiplier |
| `/pool` | View pool status and liquidity |
| `/help` | List all commands |
| `/alerts` | Toggle real time notifications on or off |

## Lending Flow

The lending flow is a guided 4 step conversation:

1. **Amount.** Bot prompts for the lending amount in gUSD.
2. **Rate.** Bot prompts for the desired interest rate. The rate is encrypted client side using the CRE public key before submission.
3. **Deposit.** Bot instructs the user to deposit tokens into the vault and private transfer to the pool. Provides the pool's shielded address.
4. **Confirm.** Bot submits the lend intent with the EIP 712 signature and encrypted rate.

## Borrowing Flow

1. **Amount.** Bot prompts for the borrow amount in gUSD.
2. **Collateral.** Bot calculates required collateral based on the user's credit tier and current ETH price. User confirms the collateral amount.
3. **Max Rate.** Bot prompts for the maximum acceptable rate. Encrypted before submission.
4. **Submit.** Bot submits the borrow intent with EIP 712 signature.

After submission, the bot automatically polls for match proposals and notifies the user when one arrives.

## Notifications

The bot includes a polling based notification system (`notifier.ts`) that checks for:

- New match proposals requiring acceptance or rejection
- Proposal auto acceptance (when the 5 second window expires)
- Loan status changes (repaid, liquidated)
- Transfer completions

Users can toggle notifications with the `/alerts` command.

## Architecture

```
User (Telegram) <-> grammY Bot <-> GHOST Server API
                                <-> External Vault API
                                <-> WalletConnect v2 (optional)
```

The bot acts as a thin client. All protocol logic runs on the server and CRE. The bot handles:
- Conversation state (multi step flows)
- Wallet management and signing
- Rate encryption
- API calls to the GHOST server
- User notification polling

## Running the Bot

```bash
cd ghost-tg
bun install
```

Set environment variables:

```bash
BOT_TOKEN=<telegram-bot-token>
GHOST_SERVER_URL=<ghost-api-url>
EXTERNAL_API_URL=<vault-api-url>
CRE_PUBLIC_KEY=<secp256k1-public-key-hex>
WALLETCONNECT_PROJECT_ID=<wc-project-id>
```

Start:

```bash
bun run src/index.ts
# or with hot reload
bun run --hot src/index.ts
```

## Source Structure

| File | Purpose |
|------|---------|
| `src/index.ts` | Bot entry point, command registration |
| `src/config.ts` | Environment configuration |
| `src/constants.ts` | ABIs, EIP 712 type definitions |
| `src/api.ts` | GHOST server and vault API clients |
| `src/wallet.ts` | Wallet creation, import, storage |
| `src/wc.ts` | WalletConnect v2 session management |
| `src/notifier.ts` | Polling notification system |
| `src/ui.ts` | Telegram message formatting helpers |
| `src/middleware.ts` | Wallet guard middleware |
| `src/commands/` | Individual command handlers (9 modules) |
