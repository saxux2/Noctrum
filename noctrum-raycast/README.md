# GHOST Protocol — Raycast Extension

Raycast extension for interacting with the GHOST Protocol private P2P lending platform.

## Features

- **Wallet Management** — Create, import, or view your Sepolia wallet
- **Balances** — View private vault + on-chain token balances (gUSD, gETH)
- **Lending** — Create lend intents with encrypted sealed-bid rates
- **Borrowing** — Submit borrow intents with collateral, accept/reject proposals
- **My Loans** — Unified view of all active loans (as lender & borrower), repay, claim excess collateral
- **Private Transfers** — Send tokens privately via the Compliant Private Transfer API
- **Shielded Addresses** — Generate shielded deposit addresses
- **Withdrawals** — Withdraw from private vault to on-chain
- **Transaction History** — Browse deposits, withdrawals, and transfers
- **Credit Score & Profile** — View tier, collateral multiplier, and loan history

## Setup

```bash
cd ghost-raycast
bun install
bun run dev
```

On first launch, use **Manage Wallet** to create or import a wallet (Sepolia private key).

## Architecture

```
src/
├── ghost.tsx              # Entry point — main navigation menu
├── views/
│   ├── WalletView.tsx     # Wallet create/import
│   ├── BalancesView.tsx   # Private + on-chain balances
│   ├── LendFormView.tsx   # Create lend intent (5-step flow)
│   ├── LendPositionsView.tsx  # Active lend intents & loans as lender
│   ├── BorrowFormView.tsx     # Create borrow intent with collateral
│   ├── BorrowPositionsView.tsx # Intents, proposals, loans as borrower
│   ├── MyLoansView.tsx    # All loans in one place
│   ├── TransferView.tsx   # Private token transfers
│   ├── ShieldedAddressView.tsx # Generate shielded address
│   ├── WithdrawView.tsx   # Withdraw to on-chain
│   ├── TransactionsView.tsx   # Transaction history
│   └── ProfileView.tsx    # Credit score & stats
├── hooks/
│   ├── useWallet.ts       # Wallet state management
│   ├── useBalances.ts     # Private balance fetching
│   ├── useLenderStatus.ts # Lender position data
│   ├── useBorrowerStatus.ts # Borrower position data
│   └── useCreditScore.ts  # Credit tier & multiplier
└── lib/
    ├── constants.ts       # URLs, addresses, EIP-712 types, token metadata
    ├── ghost-api.ts       # GHOST server API (lend, borrow, repay, etc.)
    ├── external-api.ts    # Compliant Private Transfer API (balances, transfers, withdraw)
    ├── chain.ts           # On-chain interactions (approve, deposit, withdraw via vault)
    ├── encryption.ts      # eciesjs rate encryption with CRE public key
    └── wallet.ts          # Local wallet storage (Raycast LocalStorage)
```

## Key Patterns

- **EIP-712 auth** on all signed endpoints — wallet signs typed data, server verifies
- **Sealed-bid rates** — lend/borrow rates encrypted with CRE public key, decrypted only inside Chainlink CRE
- **5-step lend flow** — approve → vault deposit → init slot → private transfer → confirm with encrypted rate
- **4-step borrow flow** — approve collateral → vault deposit → private transfer → submit intent

## Config

Server URL and RPC are set in `src/lib/constants.ts`:

```ts
GHOST_SERVER_URL = "https://do.roydevelops.tech/ghost-server"
RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"
```
