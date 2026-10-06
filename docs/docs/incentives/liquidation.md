---
sidebar_position: 3
title: Liquidation
---

# Liquidation

GHOST liquidates undercollateralized positions to protect lenders from borrower default risk. The liquidation process is automated via the CRE's `check-loans` workflow and distributes seized collateral to affected lenders.

## Health Factor

The health factor of a loan is defined as:

```
healthFactor = (collateralAmount * currentCollateralPrice) / principal
```

For example, a loan with 5 ETH collateral (at $2,000/ETH) and 8,000 gUSD principal has:

```
healthFactor = (5 * 2000) / 8000 = 1.25
```

## Liquidation Threshold

A loan is liquidated when its health factor falls below the configured threshold. The current threshold is **1.5x**.

| Health Factor | Status |
|:--------------|--------|
| Above 1.5 | Healthy |
| At 1.5 | At risk (borderline) |
| Below 1.5 | Liquidatable |
| N/A (past maturity) | Liquidatable regardless of health |

## Liquidation Triggers

The CRE's `check-loans` workflow runs every 60 seconds and checks two conditions:

1. **Undercollateralization.** The health factor has dropped below 1.5 due to collateral price decline.
2. **Maturity expiration.** The loan has passed its maturity date and the borrower has not repaid.

Either condition triggers liquidation.

## Liquidation Process

When a loan is flagged for liquidation:

1. **Loan marked as defaulted.** The loan status changes from `active` to `defaulted`.

2. **Credit tier downgraded.** The borrower's credit tier drops by one level (e.g., Gold to Silver).

3. **Protocol fee deducted.** 5% of the seized collateral goes to the protocol pool as a liquidation fee.

4. **Lender distribution.** The remaining 95% is distributed pro rata to lenders based on their matched tick amounts.

```
protocolFee = collateralAmount * 0.05
distributable = collateralAmount * 0.95

For each matched tick:
  lenderShare = (tick.amount / totalPrincipal) * distributable
  queueTransfer(tick.lender, collateralToken, lenderShare)
```

## Distribution Example

Consider a loan with:
- Principal: 10,000 gUSD
- Collateral: 6 ETH
- Matched ticks: Alice (4,000 at 3.5%), Bob (6,000 at 4.0%)

Upon liquidation:

| Recipient | Calculation | Amount |
|-----------|-------------|--------|
| Protocol | 6 ETH * 5% | 0.30 ETH |
| Alice | 5.70 ETH * (4,000 / 10,000) | 2.28 ETH |
| Bob | 5.70 ETH * (6,000 / 10,000) | 3.42 ETH |

## Loss Distribution and Rate Risk

In the litepaper's formal model, liquidation losses are absorbed by higher rate ticks first. Lenders who bid higher rates accepted more risk and therefore bear losses before conservative lenders. However, the current implementation uses simple pro rata distribution for implementation simplicity.

## Price Feed Integration

The CRE reads the ETH/USD price from Chainlink Data Streams on Arbitrum:

```typescript
const result = EVMClient.readContract(runtime, {
  chainName: config.feedChainName,    // "ethereum-testnet-sepolia-arbitrum-1"
  contractAddress: config.ethUsdFeed, // Chainlink feed address
  abi: PriceFeedAggregatorABI,
  functionName: "latestRoundData",
  args: [],
});

const price = Number(answer) / 1e8; // Chainlink feeds use 8 decimals
```

Using Chainlink's own price infrastructure ensures that the collateral valuation used for health checks is tamper resistant and consistent with the broader DeFi ecosystem.

## Liquidation Transfers

After liquidation is processed on the server, the collateral distribution transfers are added to the pending transfer queue. The `execute-transfers` CRE workflow picks them up on its next cycle (every 15 seconds) and executes them through the vault's private transfer mechanism.

Transfer reasons for liquidation related movements:

| Reason | Description |
|--------|-------------|
| `liquidate` | Lender receiving their share of seized collateral |
| `liquidate` | Protocol receiving the 5% liquidation fee |
