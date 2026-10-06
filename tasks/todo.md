# CRE Workflows Implementation

## Server Changes
- [x] Add PendingTransfer type to types.ts
- [x] Add pendingTransfers map + queueTransfer helper to state.ts
- [x] Make POOL_PRIVATE_KEY optional in config.ts
- [x] cancelLend: queue transfer instead of direct call
- [x] cancelBorrow: queue transfer
- [x] acceptProposal: queue transfer
- [x] rejectProposal: queue transfer
- [x] expireProposals: queue transfer
- [x] repayLoan: queue collateral return transfer
- [x] Add getPendingTransfers, executeTransfer, confirmTransfers to internal.controllers.ts
- [x] Mount new internal endpoints in ghost.routes.ts

## CRE Workflows
- [x] settle-loans/main.ts — matching engine
- [x] execute-transfers/main.ts — fund movement
- [x] check-loans/main.ts — liquidation monitoring
- [x] Update config.staging.json for all 3 workflows

## Verification
- [x] CRE workflows type-check (all 3 pass)
- [x] Server runtime test (health check ok)
- [ ] Integration test with CRE simulation

## Liquidation, Default & Credit Score
- [x] Add CreditTier, CreditScore types + "liquidate" reason to types.ts
- [x] Add creditScores map + getCreditScore/upgradeTier/downgradeTier to state.ts
- [x] Add getCollateralMultiplier export to state.ts
- [x] Add POST /internal/liquidate-loans controller (seize collateral, 95/5 split, downgrade borrower)
- [x] Update repay controller to upgrade tier + increment loansRepaid
- [x] Enforce collateral requirement by credit tier in borrow controller
- [x] Add GET /credit-score/:address public endpoint
- [x] Update CRE check-loans to POST unhealthy loanIds to /internal/liquidate-loans
- [x] Create root CLAUDE.md with project context
- [x] Server + CRE compile clean
- [ ] E2E verification (repay → tier up, liquidation → tier down, collateral check)
