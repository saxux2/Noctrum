# e2e-test

End-to-end scripts for NOCTRUM on Monad Testnet. They run in order against a server (`SERVER_URL`, default `http://localhost:8080`) and `noctrum-vault-api` (`VAULT_API_URL`, default `http://localhost:8081`). Between steps 3 and 4, the deployed CRE workflows match the intents (or run `cre workflow simulate` by hand).

To install dependencies:

```bash
bun install
```

Create `.env` with the test wallet keys (never commit it): `PRIVATE_KEY` (deployer), `POOL_PRIVATE_KEY`, `LENDER_A_KEY`, `LENDER_B_KEY`, `BORROWER_KEY`, and `INTERNAL_API_KEY` if the server sets one. Optional: `RPC_URL` (default `https://testnet-rpc.monad.xyz`).

To run:

```bash
bun run src/01_transfer-funds.ts          # fund wallets with MON, nUSD, nETH
bun run src/02_vault_deposit_and_lend.ts
bun run src/03_vault_deposit_and_borrow.ts
bun run src/04_check_final_loan_and_withdraw.ts
bun run src/05_check_credit_score.ts
bun run src/06_repay_and_check_upgrade.ts
bun run src/07_liquidation_flow.ts
bun run src/08_collateral_tier_check.ts
```

Addresses come from `../deployments/monad-testnet.json` (copied into `src/utils/config.ts`).
