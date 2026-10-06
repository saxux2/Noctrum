---
sidebar_position: 4
title: Check Loans
---

# Check Loans Workflow

The `check-loans` workflow monitors the health of all active loans and triggers liquidation for positions that become undercollateralized or expire past maturity.

## Execution Flow

```
1. Fetch all active loans from server
2. Read current ETH/USD price from Chainlink price feed
3. For each loan, compute health factor
4. Collect loans that are undercollateralized or past maturity
5. Submit liquidation request for unhealthy loans
```

## Health Factor Calculation

For each active loan:

```typescript
const collateralValueUSD = Number(loan.collateralAmount) * ethPrice;
const health = collateralValueUSD / Number(loan.principal);
```

The health factor represents how many times the collateral covers the loan principal in USD terms.

## Liquidation Conditions

A loan qualifies for liquidation if either condition is met:

| Condition | Formula | Description |
|-----------|---------|-------------|
| Undercollateralized | `health < liquidationThreshold` | Collateral value dropped below 1.5x principal |
| Expired | `now > loan.maturity` | Loan has passed its maturity date without repayment |

The `liquidationThreshold` is currently set to **1.5** (matching the collateral system's minimum healthy ratio).

## Price Feed Integration

The ETH/USD price is read from Chainlink Data Streams on Arbitrum via the CRE's EVMClient:

```typescript
const result = EVMClient.readContract(runtime, {
  chainName: config.feedChainName,
  contractAddress: config.ethUsdFeed,
  abi: [
    {
      name: "latestRoundData",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [
        { name: "roundId", type: "uint80" },
        { name: "answer", type: "int256" },
        { name: "startedAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "answeredInRound", type: "uint80" },
      ],
    },
  ],
  functionName: "latestRoundData",
  args: [],
});

const [, answer] = result;
const ethPrice = Number(answer) / 1e8; // 8 decimal precision
```

Using Chainlink's own price infrastructure ensures consistency. The same price feed that DeFi protocols rely on for billions in TVL protects GHOST's collateral valuations.

## Liquidation Submission

When unhealthy loans are found, the workflow submits their IDs to the server:

```typescript
if (toLiquidate.length > 0) {
  ConfidentialHTTPClient.sendRequest(runtime, {
    url: `${config.ghostApiUrl}/api/v1/internal/liquidate-loans`,
    method: "POST",
    headers: {
      "x-api-key": config.internalApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ loanIds: toLiquidate }),
  }).result();
}
```

The server then processes the liquidation (marking defaults, distributing collateral, downgrading credit tiers) and queues the resulting transfers for the `execute-transfers` workflow.

## Example Scenario

Consider a loan:
- Principal: 10,000 gUSD
- Collateral: 6 gETH
- ETH price at creation: $2,500 (health = 1.5)

If ETH drops to $2,400:
```
health = (6 * 2400) / 10000 = 1.44
```

Since 1.44 < 1.5, this loan is liquidated on the next check cycle.

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `schedule` | Cron interval | Every 60 seconds |
| `ghostApiUrl` | GHOST API base URL | Required |
| `internalApiKey` | API key for internal endpoints | DON Secret |
| `feedChainName` | Chain name for price feed reads | `ethereum-testnet-sepolia-arbitrum-1` |
| `ethUsdFeed` | Chainlink ETH/USD feed contract address | Config |
| `liquidationThreshold` | Minimum health factor | 1.5 |

## Monitoring Frequency

The 60 second interval balances responsiveness with CRE execution costs:

- Fast enough to catch most undercollateralization events before they become severely underwater
- Slow enough to stay within CRE execution budgets
- In production, this interval could be tightened during high volatility periods using adaptive scheduling
