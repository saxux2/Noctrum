# Demo Tweaks

Changes made for demo/testing that should be reverted for production.

## 1. Proposal TTL reduced to 5 seconds
- **File**: `server/src/controllers/internal.controllers.ts` line ~59
- **Change**: `expiresAt: Date.now() + 5 * 1000` (was `5 * 60 * 1000` = 5 min)
- **Why**: So settle-loans can auto-accept proposals quickly during demo
- **Revert**: Change back to `5 * 60 * 1000`

## 2. Test wallet keys in server/.env
- **File**: `server/.env`
- **Added**: `LENDER_A_KEY`, `LENDER_B_KEY`, `BORROWER_KEY`
- **Revert**: Remove those 4 lines (comment + 3 keys)

## 3. Wallets funded on Sepolia
- Lender A (`0x3944...`): 500 gUSD minted, 0.005 ETH gas
- Lender B (`0x3ED1...`): 500 gUSD minted, 0.005 ETH gas
- Borrower (`0xeB10...`): 5 gETH minted, 0.005 ETH gas
- Pool wallet (`0x135a...`): 1M gUSD minted earlier

## 5. settle-loans crypto.randomUUID() replaced
- **File**: `ghost-settler/settle-loans/main.ts` line ~152
- **Change**: Replaced `crypto.randomUUID()` with `Date.now().toString(36)` based ID
- **Why**: CRE runtime doesn't have `crypto` global
- **Revert**: Change back to `crypto.randomUUID()` if CRE adds crypto support

## 4. secrets.yaml env var mapping
- **File**: `ghost-settler/secrets.yaml`
- **Change**: `- INTERNAL_API_KEY` (was `- ghost-protocol`)
- **Why**: CRE simulator can't load hyphenated env var names from .env
- **Revert for deployment**: Change back to `- ghost-protocol` (vault DON namespace)
