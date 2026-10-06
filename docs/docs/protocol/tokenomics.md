---
sidebar_position: 4
title: Tokenomics
---

# Tokenomics

GHOST operates with two synthetic tokens on Sepolia: gUSD as the lending denomination and gETH as the collateral asset. Both are ERC20 tokens deployed via the `SimpleToken` contract with ERC20Permit support for gasless approvals.

## Token Overview

| Property | gUSD | gETH |
|----------|------|------|
| Full Name | Ghost USD | Ghost ETH |
| Role | Lending and borrowing denomination | Borrower collateral |
| Decimals | 18 | 18 |
| Contract | SimpleToken (ERC20 + ERC20Permit) | SimpleToken (ERC20 + ERC20Permit) |
| Address (Sepolia) | `0xD318551FbC638C4C607713A92A19FAd73eb8f743` | `0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6` |
| Supply Cap | Unlimited (owner mintable) | Unlimited (owner mintable) |
| Peg Target | 1 USD | Tracks ETH/USD |

## gUSD: The Lending Token

gUSD is a USD pegged stablecoin that serves as the primary unit of account in the GHOST protocol. All lending, borrowing, interest, and repayment amounts are denominated in gUSD.

### How gUSD Flows Through the Protocol

| Stage | Flow |
|-------|------|
| Deposit | Lender transfers gUSD from wallet to Chainlink vault via on chain `deposit()` |
| Shield | Lender executes a private transfer from their vault balance to the GHOST pool shielded address |
| Lend Intent | Lender submits an intent specifying the gUSD amount and an encrypted interest rate |
| Matching | CRE matches lender gUSD supply with borrower demand at the best available rates |
| Disbursement | On match acceptance, gUSD is privately transferred from the pool to the borrower |
| Repayment | Borrower repays gUSD principal plus interest; each lender receives their tick amount plus interest at their individual bid rate |
| Withdrawal | Lender withdraws gUSD from the vault back to their on chain wallet |

### Interest Denomination

All interest calculations use gUSD amounts with 18 decimal fixed point arithmetic:

```
tickInterest = tickAmount * tickRate * (loanDuration / 365)
lenderPayout = tickAmount + tickInterest
```

Since GHOST uses discriminatory pricing, each lender earns interest at their own bid rate rather than a blended pool rate. The total interest paid by a borrower is the sum of individual tick interests across all matched ticks.

## gETH: The Collateral Token

gETH is a synthetic ETH token used exclusively as collateral for borrowing positions. Its value is determined by the Chainlink ETH/USD price feed on Arbitrum.

### Collateral Valuation

The gETH collateral requirement for a given loan is:

```
requiredCollateral = (loanAmountGUSD * collateralMultiplier) / ethPriceUSD
```

Where `collateralMultiplier` depends on the borrower's credit tier:

| Credit Tier | Multiplier | gETH Required for 10,000 gUSD Loan (at ETH = $2,200) |
|-------------|-----------|------------------------------------------------------|
| Bronze | 2.0x | 9.09 gETH |
| Silver | 1.8x | 8.18 gETH |
| Gold | 1.5x | 6.82 gETH |
| Platinum | 1.2x | 5.45 gETH |

### Price Feed

gETH valuation relies on the Chainlink ETH/USD Data Streams feed:

| Property | Value |
|----------|-------|
| Feed Address | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` |
| Chain | Arbitrum |
| Precision | 8 decimals |
| Read By | CRE via EVMClient `latestRoundData()` |

The CRE reads this feed every 60 seconds during health checks and on demand during collateral validation for new borrow intents.

### Collateral Lifecycle

| Event | gETH Movement |
|-------|---------------|
| Borrow intent submitted | gETH debited from borrower's balance, held in pool |
| Borrow cancelled | Full gETH returned to borrower |
| Proposal rejected | 95% gETH returned to borrower, 5% slashed to protocol |
| Loan repaid | Full gETH returned to borrower |
| Excess collateral claimed | Excess gETH (above current requirement) returned to borrower |
| Liquidation | 5% gETH to protocol, 95% distributed pro rata to lenders |

## Swap Pool

GHOST includes a swap pool contract (`GhostSwapPool`) that enables exchanging between gUSD and gETH.

| Property | Value |
|----------|-------|
| Contract Address (Sepolia) | `0xF683c97a1072e4C41ae568341141b7553d40B08B` |
| gUSD Price | $1.00 |
| gETH Price | $2,200.00 (owner configurable) |
| Slippage Protection | 5% |
| Seed Liquidity | 10,000 gUSD + 10 gETH |

### Swap Formula

```
amountOut = (amountIn * priceIn) / priceOut
```

For example, swapping 2,200 gUSD for gETH:

```
amountOut = (2200 * 1e18) / 2200e18 = 1 gETH
```

The pool owner can update token prices via `setPrice()` to reflect market conditions. Swaps are available through the Telegram bot (`/swap`) and the client application.

## Token Contract

Both gUSD and gETH use the same `SimpleToken` contract:

```solidity
contract SimpleToken is ERC20, ERC20Permit, Ownable {
    constructor(string memory name, string memory symbol, address owner)
        ERC20(name, symbol)
        ERC20Permit(name)
        Ownable(owner)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

Key properties:
- **ERC20Permit** enables gasless approvals via EIP 2612 signatures, reducing transaction count for vault deposits
- **Owner mintable** with no supply cap, suitable for testnet where tokens need to be freely distributed
- **No burn function** exposed publicly; tokens are only destroyed when the vault processes withdrawals

## Custody and Privacy

Both tokens are held in the Chainlink Compliant Private Transfer vault at `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13`. Once deposited:

| Property | On Chain | In Vault |
|----------|---------|----------|
| Balance visibility | Public (ERC20 `balanceOf`) | Private (off chain tracking) |
| Transfer mechanism | Standard ERC20 `transfer` | Signed private transfer requests |
| Approval mechanism | `approve` or EIP 2612 `permit` | EIP 712 typed data signatures |
| Withdrawal | N/A | Via signed withdrawal ticket (1 hour validity) |

The vault's compliance layer (PolicyEngine) enforces transfer rules on every movement, ensuring that tokens can only flow through authorized channels.

## Economic Dynamics

### Supply Side (Lenders)

Lenders earn yield on their gUSD deposits at their individually chosen rates. The sealed bid auction prevents rate front running, so lenders set rates based on their true cost of capital rather than reactive positioning. Higher rates earn more per unit but face lower fill probability.

### Demand Side (Borrowers)

Borrowers access gUSD liquidity by posting gETH collateral. The blended rate they pay is determined by which ticks fill their demand (cheapest first). Better credit tiers reduce collateral requirements, creating a direct economic incentive for repayment history.

### Cross Asset Risk

The primary systemic risk is gETH price decline, which can trigger cascading liquidations:

1. ETH price drops below the liquidation threshold for a loan
2. CRE seizes gETH collateral and distributes to lenders
3. Lenders receive gETH instead of their original gUSD
4. If many loans liquidate simultaneously, lenders face concentrated gETH exposure

This risk is mitigated by the overcollateralization requirement (minimum 1.2x for Platinum, 2.0x for Bronze) and the 60 second health check interval.

### Protocol Revenue

The protocol earns revenue from two sources:

| Source | Rate | Trigger |
|--------|------|---------|
| Rejection penalty | 5% of collateral (gETH) | Borrower rejects a match proposal |
| Liquidation fee | 5% of seized collateral (gETH) | Loan falls below health threshold |

Both revenue streams are denominated in gETH and accumulate in the protocol pool address.
