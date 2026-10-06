---
sidebar_position: 2
title: Transfer Reasons
---

# Transfer Reasons

Every pending transfer in GHOST has a `reason` field that identifies why the fund movement was queued. This enables auditing, debugging, and correct routing of funds.

## Reason Codes

| Reason | Description | Source Action |
|--------|-------------|---------------|
| `cancel-lend` | Return funds to a lender who cancelled their intent | Lender calls `POST /cancel-lend` |
| `cancel-borrow` | Return collateral to a borrower (95% on rejection, 100% on cancellation) | Borrower calls `POST /cancel-borrow` or `POST /reject-proposal` |
| `disburse` | Send matched principal from pool to borrower | Proposal accepted (explicit or auto) |
| `return-collateral` | Return full collateral to borrower after loan repayment | Borrower calls `POST /repay` |
| `return-collateral-repay` | Send principal plus interest payout to a lender | Borrower calls `POST /repay` |
| `liquidate` | Distribute seized collateral to lenders or protocol | CRE calls `POST /internal/liquidate-loans` |

## Flow by Reason

### cancel-lend

```
Lender cancels intent
  -> Server queues transfer: pool -> lender, amount = deposit, reason = "cancel-lend"
  -> CRE executes via vault private transfer
```

### cancel-borrow

Two transfers are queued when a borrower rejects a proposal:

```
Borrower rejects proposal
  -> Server queues transfer: pool -> borrower, amount = 95% collateral, reason = "cancel-borrow"
  -> Server queues transfer: pool -> protocol, amount = 5% collateral, reason = "cancel-borrow"
```

When a borrower cancels a pending intent (before matching):

```
Borrower cancels intent
  -> Server queues transfer: pool -> borrower, amount = 100% collateral, reason = "cancel-borrow"
```

### disburse

```
Proposal accepted (explicit or auto-accept)
  -> Server queues transfer: pool -> borrower, amount = principal, reason = "disburse"
```

### return-collateral

```
Borrower repays loan in full
  -> Server queues transfer: pool -> borrower, amount = collateral, reason = "return-collateral"
```

### return-collateral-repay

One transfer per matched tick:

```
Borrower repays loan
  -> For each tick:
     Server queues transfer: pool -> lender, amount = tick principal + interest, reason = "return-collateral-repay"
```

### liquidate

Multiple transfers per liquidation:

```
CRE triggers liquidation
  -> Server queues transfer: pool -> protocol, amount = 5% collateral, reason = "liquidate"
  -> For each tick:
     Server queues transfer: pool -> lender, amount = pro-rata share of 95%, reason = "liquidate"
```

## Transfer Lifecycle

All transfers follow the same lifecycle:

| Status | Description |
|--------|-------------|
| `pending` | Transfer has been queued by the server. Waiting for CRE pickup. |
| `completed` | CRE has executed the transfer through the vault and confirmed it. |

The `execute-transfers` workflow polls for `pending` transfers every 15 seconds, executes up to 3 per cycle, and marks them `completed` via the `confirm-transfers` endpoint.
