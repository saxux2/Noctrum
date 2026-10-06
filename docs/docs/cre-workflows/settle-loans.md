---
sidebar_position: 2
title: Settle Loans
---

# Settle Loans Workflow

The `settle-loans` workflow is the core matching engine. It runs every 30 seconds, decrypts sealed rate bids, pairs lenders with borrowers, and posts match proposals back to the server.

## Execution Flow

```
1. Call expireProposals() to auto-accept timed out proposals
2. Call getPendingIntents() to fetch active lends and borrows
3. Decrypt all encrypted rates using CRE private key
4. Run the matching engine
5. Call recordMatchProposals() to post results
6. Return summary string
```

## Step 1: Expire Proposals

Before processing new intents, the workflow calls the server's `expire-proposals` endpoint. This auto accepts any proposals from the previous epoch that borrowers did not explicitly accept or reject within the 5 second window. This ensures that:

- Lender liquidity is not indefinitely locked in stale proposals
- Borrowers cannot passively avoid loan creation
- The available pool is clean before the next matching round

## Step 2: Fetch Pending Intents

The workflow fetches all unmatched lend intents and pending borrow intents:

```typescript
const response = ConfidentialHTTPClient.sendRequest(runtime, {
  url: `${config.ghostApiUrl}/api/v1/internal/pending-intents`,
  method: "GET",
  headers: { "x-api-key": config.internalApiKey },
}).result();

const { lendIntents, borrowIntents } = JSON.parse(response.body);
```

Lend intents that are currently locked in pending proposals are excluded by the server.

## Step 3: Rate Decryption

Each lend intent's `encryptedRate` is decrypted using the CRE's private key:

```typescript
function decryptRate(encryptedRate: string, privateKeyHex: string): number {
  // Try parsing as plaintext first (for testing)
  const plain = parseFloat(encryptedRate);
  if (!isNaN(plain) && plain > 0 && plain < 1) {
    return plain;
  }

  // ECIES decryption
  const decrypted = decrypt(privateKeyHex, Buffer.from(encryptedRate, "hex"));
  return parseFloat(decrypted.toString());
}
```

The plaintext fallback exists for local testing where encryption is bypassed. In production, all rates are ECIES encrypted.

## Step 4: Matching Engine

The core matching algorithm:

1. Sort lend intents by decrypted rate ascending (cheapest first)
2. Sort borrow intents by amount descending (largest demand first)
3. For each borrow intent, greedily fill from cheapest available lend ticks
4. Compute the blended effective rate across matched ticks
5. If the blended rate exceeds the borrower's max rate, release ticks and skip
6. Otherwise, package the match as a proposal

```typescript
function runMatchingEngine(
  lends: DecryptedLend[],
  borrows: BorrowIntent[]
): MatchProposal[] {
  const sortedLends = lends.sort((a, b) => a.rate - b.rate);
  const sortedBorrows = borrows.sort(
    (a, b) => Number(b.amount) - Number(a.amount)
  );

  const proposals: MatchProposal[] = [];

  for (const borrow of sortedBorrows) {
    const ticks: MatchedTick[] = [];
    let remaining = BigInt(borrow.amount);

    for (const lend of sortedLends) {
      if (remaining <= 0n) break;
      const available = BigInt(lend.amount) - BigInt(lend.used || 0);
      if (available <= 0n) continue;

      const fill = remaining < available ? remaining : available;
      ticks.push({
        lender: lend.userId,
        lendIntentId: lend.intentId,
        amount: fill.toString(),
        rate: lend.rate,
      });
      remaining -= fill;
      lend.used = (BigInt(lend.used || 0) + fill).toString();
    }

    if (remaining > 0n) {
      // Insufficient liquidity, release ticks
      for (const tick of ticks) {
        const lend = sortedLends.find(l => l.intentId === tick.lendIntentId);
        if (lend) lend.used = (BigInt(lend.used || 0) - BigInt(tick.amount)).toString();
      }
      continue;
    }

    // Compute blended rate
    const totalAmount = ticks.reduce((s, t) => s + BigInt(t.amount), 0n);
    const weightedRate = ticks.reduce(
      (s, t) => s + Number(t.amount) * t.rate, 0
    ) / Number(totalAmount);

    if (weightedRate > borrow.maxRate) {
      // Release ticks
      continue;
    }

    proposals.push({
      borrowIntentId: borrow.intentId,
      borrower: borrow.borrower,
      token: borrow.token,
      principal: totalAmount.toString(),
      matchedTicks: ticks,
      effectiveBorrowerRate: weightedRate,
      collateralToken: borrow.collateralToken,
      collateralAmount: borrow.collateralAmount,
    });
  }

  return proposals;
}
```

## Step 5: Submit Proposals

Valid proposals are posted to the server:

```typescript
ConfidentialHTTPClient.sendRequest(runtime, {
  url: `${config.ghostApiUrl}/api/v1/internal/record-match-proposals`,
  method: "POST",
  headers: {
    "x-api-key": config.internalApiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ proposals }),
}).result();
```

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `schedule` | Cron interval | Every 30 seconds |
| `ghostApiUrl` | GHOST API base URL | Required |
| `internalApiKey` | API key for internal endpoints | DON Secret |
| `crePrivateKey` | ECIES private key for rate decryption | DON Secret |
