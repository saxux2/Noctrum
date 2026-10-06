# noctrum-vault-api

Private ledger service for NOCTRUM on Monad Testnet. It is the off-chain half of the self-hosted vault that replaces Chainlink's Compliant Private Token (CPT) vault and API, which only exist on Ethereum Sepolia. The endpoints, JSON shapes and EIP-712 request types match the CPT API, so the server, CRE workflows and clients use it unchanged.

- Keeps private (shielded) balances in MongoDB
- Executes private transfers between accounts and shielded addresses
- Signs withdrawal tickets that users redeem on-chain with `NoctrumVault.withdrawWithTicket`
- Indexes `NoctrumVault` `Deposit` / `Withdraw` events on Monad (finalized blocks, ≤ 100-block pages), credits deposits and refunds expired tickets
- Checks that the vault's token holdings cover the ledger (invariant job)

## Endpoints

All `POST` endpoints take an EIP-712 signed body. Domain: `NoctrumPrivateToken` / `0.0.1` / chainId 10143 / verifyingContract NoctrumVault. Timestamps must be within 5 minutes.

| Method | Path | Typed-data type |
|---|---|---|
| GET | `/health` | — |
| POST | `/balances` | Retrieve Balances |
| POST | `/transactions` | List Transactions |
| POST | `/private-transfer` | Private Token Transfer (optional `hide-sender` flag) |
| POST | `/shielded-address` | Generate Shielded Address |
| POST | `/withdraw` | Withdraw Tokens (returns `ticket`, `amount`, `deadline`; ticket valid 1 hour) |

Private transfers and withdrawals are dry-run against the vault's Chainlink ACE policy checks (`checkPrivateTransferAllowed`, `checkWithdrawAllowed`) with `eth_call`.

## Setup

MongoDB must be a replica set, because ledger writes use transactions:

```bash
docker run -d -p 27017:27017 --name noctrum-mongo mongo:7 --replSet rs0
docker exec noctrum-mongo mongosh --eval "rs.initiate()"
```

```bash
bun install
cp .env.example .env   # set TICKET_SIGNER_PRIVATE_KEY
bun run dev            # bun run --hot src/index.ts
curl http://localhost:8081/health
```

`TICKET_SIGNER_PRIVATE_KEY` must belong to the address set as `NoctrumVault.ticketSigner`; the service logs an alert at startup if they differ. Set `INDEXER_ENABLED=false` to serve the API without the Monad indexer. The other variables are documented in `.env.example`.

## Tests

```bash
bun test
```

Tests use `mongodb-memory-server`. `anvil.test.ts` needs `anvil` and `forge build` artifacts in `../contracts/out`; it is skipped otherwise.

## Deployment

Deployed on Railway: `https://vault-api-production-30bb.up.railway.app` (see `../deployments/monad-testnet.json`). The Telegram bot runs in the same service; deploy with `../deploy/vault-api-tg/deploy.sh`.
