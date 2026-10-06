---
sidebar_position: 4
title: Tokenomics
---

# Tokenomics

NOCTRUM operates with two synthetic tokens on Sepolia: nUSD as the lending denomination and nETH as the collateral asset. Both are ERC20 tokens deployed via the `SimpleToken` contract with ERC20Permit support for gasless approvals.

## Token Overview

| Property | nUSD | nETH |
|----------|------|------|
| Full Name | Noctrum USD | Noctrum ETH |
| Role | Lending and borrowing denomination | Borrower collateral |
| Decimals | 18 | 18 |
| Contract | SimpleToken (ERC20 + ERC20Permit) | SimpleToken (ERC20 + ERC20Permit) |
| Address (Sepolia) | `0xD318551FbC638C4C607713A92A19FAd73eb8f743` | `0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6` |
| Supply Cap | Unlimited (owner mintable) | Unlimited (owner mintable) |
| Peg Target | 1 USD | Tracks ETH/USD |

## nUSD: The Lending Token

nUSD is a USD pegged stablecoin that serves as the primary unit of account in the NOCTRUM protocol. All lending, borrowing, interest, and repayment amounts are denominated in nUSD.

### How nUSD Flows Through the Protocol

| Stage | Flow |
|-------|------|
| Deposit | Lender transfers nUSD from wallet to Chainlink vault via on chain `deposit()` |
| Shield | Lender executes a private transfer from their vault balance to the NOCTRUM pool shielded address |
| Lend Intent | Lender submits an intent specifying the nUSD amount and an encrypted interest rate |
| Matching | CRE matches lender nUSD supply with borrower demand at the best available rates |
| Disbursement | On match acceptance, nUSD is privately transferred from the pool to the borrower |
| Repayment | Borrower repays nUSD principal plus interest; each lender receives their tick amount plus interest at their individual bid rate |
| Withdrawal | Lender withdraws nUSD from the vault back to their on chain wallet |

### Interest Denomination

All interest calculations use nUSD amounts with 18 decimal fixed point arithmetic:

```
tickInterest = tickAmount * tickRate * (loanDuration / 365)
lenderPayout = tickAmount + tickInterest
```

Since NOCTRUM uses discriminatory pricing, each lender earns interest at their own bid rate rather than a blended pool rate. The total interest paid by a borrower is the sum of individual tick interests across all matched ticks.

## nETH: The Collateral Token

nETH is a synthetic ETH token used exclusively as collateral for borrowing positions. Its value is determined by the Chainlink ETH/USD price feed on Arbitrum.

### Collateral Valuation

The nETH collateral requirement for a given loan is:

```
requiredCollateral = (loanAmountNUSD * collateralMultiplier) / ethPriceUSD
```

Where `collateralMultiplier` depends on the borrower's credit tier:

| Credit Tier | Multiplier | nETH Required for 10,000 nUSD Loan (at ETH = $2,200) |
|-------------|-----------|------------------------------------------------------|
| Bronze | 2.0x | 9.09 nETH |
| Silver | 1.8x | 8.18 nETH |
| Gold | 1.5x | 6.82 nETH |
| Platinum | 1.2x | 5.45 nETH |

### Price Feed

nETH valuation relies on the Chainlink ETH/USD Data Streams feed:

| Property | Value |
|----------|-------|
| Feed Address | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` |
| Chain | Arbitrum |
| Precision | 8 decimals |
| Read By | CRE via EVMClient `latestRoundData()` |

The CRE reads this feed every 60 seconds during health checks and on demand during collateral validation for new borrow intents.

### Collateral Lifecycle

| Event | nETH Movement |
|-------|---------------|
| Borrow intent submitted | nETH debited from borrower's balance, held in pool |
| Borrow cancelled | Full nETH returned to borrower |
| Proposal rejected | 95% nETH returned to borrower, 5% slashed to protocol |
| Loan repaid | Full nETH returned to borrower |
| Excess collateral claimed | Excess nETH (above current requirement) returned to borrower |
| Liquidation | 5% nETH to protocol, 95% distributed pro rata to lenders |

## Swap Pool

NOCTRUM includes a swap pool contract (`NoctrumSwapPool`) that enables exchanging between nUSD and nETH.

| Property | Value |
|----------|-------|
| Contract Address (Sepolia) | `0xF683c97a1072e4C41ae568341141b7553d40B08B` |
| nUSD Price | $1.00 |
| nETH Price | $2,200.00 (owner configurable) |
| Slippage Protection | 5% |
| Seed Liquidity | 10,000 nUSD + 10 nETH |

### Swap Formula

```
amountOut = (amountIn * priceIn) / priceOut
```

For example, swapping 2,200 nUSD for nETH:

```
amountOut = (2200 * 1e18) / 2200e18 = 1 nETH
```

The pool owner can update token prices via `setPrice()` to reflect market conditions. Swaps are available through the Telegram bot (`/swap`) and the client application.

## Token Contract

Both nUSD and nETH use the same `SimpleToken` contract:

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

Lenders earn yield on their nUSD deposits at their individually chosen rates. The sealed bid auction prevents rate front running, so lenders set rates based on their true cost of capital rather than reactive positioning. Higher rates earn more per unit but face lower fill probability.

### Demand Side (Borrowers)

Borrowers access nUSD liquidity by posting nETH collateral. The blended rate they pay is determined by which ticks fill their demand (cheapest first). Better credit tiers reduce collateral requirements, creating a direct economic incentive for repayment history.

### Cross Asset Risk

The primary systemic risk is nETH price decline, which can trigger cascading liquidations:

1. ETH price drops below the liquidation threshold for a loan
2. CRE seizes nETH collateral and distributes to lenders
3. Lenders receive nETH instead of their original nUSD
4. If many loans liquidate simultaneously, lenders face concentrated nETH exposure

This risk is mitigated by the overcollateralization requirement (minimum 1.2x for Platinum, 2.0x for Bronze) and the 60 second health check interval.

### Protocol Revenue

The protocol earns revenue from two sources:

| Source | Rate | Trigger |
|--------|------|---------|
| Rejection penalty | 5% of collateral (nETH) | Borrower rejects a match proposal |
| Liquidation fee | 5% of seized collateral (nETH) | Loan falls below health threshold |

Both revenue streams are denominated in nETH and accumulate in the protocol pool address.
