# Noctrum — Smart Contracts Specification

Foundry project. Ghost path: `ghost/transfer-demo/`. Noctrum path: `contracts/` (rename decision D-10; default `contracts/`).

## 0. Inventory: what Ghost actually has

| Ghost file | Kind | Deployed by Ghost? | Noctrum action |
|---|---|---|---|
| `src/SimpleToken.sol` | ERC20 + ERC20Permit + Ownable, owner mint | Yes: gUSD `0xD318551FbC638C4C607713A92A19FAd73eb8f743`, gETH `0x81aF9668d4a67AeDFD43bF38787debA8FD33cbA6` (Sepolia) | Copy verbatim. Deploy nUSD and nETH |
| `src/GhostSwapPool.sol` | Owner-priced multi-token swap | Yes: `0xF683c97a1072e4C41ae568341141b7553d40B08B` (Sepolia) | Rename to `NoctrumSwapPool.sol`, logic verbatim |
| `src/interfaces/IGhostVault.sol` | Interface only (future design) | No | Rename to `INoctrumVault.sol` and keep as an interface. **Do not implement** (out of scope) |
| `src/interfaces/ICollateralManager.sol` | Interface only | No | Keep verbatim (rename Ghost→Noctrum in comments) |
| `src/interfaces/IGhostLoanLedger.sol` | Interface only | No | Rename to `INoctrumLoanLedger.sol` |
| `src/interfaces/ICRECallback.sol` | Interface only | No | Keep (comments: GhostRouter→NoctrumRouter) |
| `src/libraries/InterestAccrual.sol` | Pure library, unused by deployed code | No | Copy verbatim |
| Chainlink ACE `PolicyEngine` (lib `chainlink-ace` v1.0.0) | Deployed behind an ERC1967Proxy by scripts 02/SetupAll | Yes (address not recorded in repo) | Deploy the same way on Monad |
| Chainlink **CPT Vault** `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` | **External, Chainlink-owned**, Sepolia only | No (Chainlink) | ❌ Not on Monad. **Implement `NoctrumVault.sol`** with the same ABI (§3) |

Dependencies (`foundry.lock`): forge-std v1.14.0, openzeppelin-contracts v5.5.0, openzeppelin-contracts-upgradeable v5.5.0, chainlink-ace v1.0.0 (rev `288c393a…`).

`foundry.toml` (Ghost): solc 0.8.26, optimizer on with 200 runs, `via_ir = true`, `evm_version = "cancun"`.

Remappings:
```
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
@chainlink/policy-management/=lib/chainlink-ace/packages/policy-management/src/
forge-std/=lib/forge-std/src/
```

Monad changes to `foundry.toml` ([Monad verify guide](https://docs.monad.xyz/guides/verify-smart-contract/foundry.md)):
- Add `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`, `chain_id = 10143`.
- Keep `evm_version = "cancun"`. Monad supports every opcode up to its current fork (Fusaka per [summary](https://docs.monad.xyz/developer-essentials/summary)), so cancun bytecode is valid.
- Foundry ≥ 1.8.0 recommended.

---

## 1. SimpleToken (nUSD, nETH)

```solidity
contract SimpleToken is ERC20, ERC20Permit, Ownable {
    constructor(string memory name_, string memory symbol_, address initialOwner)
        ERC20(name_, symbol_) ERC20Permit(name_) Ownable(initialOwner) {}
    function mint(address to, uint256 amount) external onlyOwner { _mint(to, amount); }
}
```

| Item | Spec |
|---|---|
| Storage | OZ ERC20 balances/allowances/supply, ERC20Permit nonces, EIP712 cached domain, Ownable owner |
| Functions | All of OZ ERC20 + `permit` + `nonces` + `DOMAIN_SEPARATOR` + `mint` (onlyOwner) + Ownable admin |
| Events | Transfer, Approval, OwnershipTransferred, EIP712DomainChanged (OZ) |
| Errors | OZ custom errors (ERC20InsufficientBalance, OwnableUnauthorizedAccount, ERC2612ExpiredSignature, …) |
| Decimals | 18 |
| Constructor args | nUSD: `("Noctrum USD","nUSD",deployer)`. nETH: `("Noctrum ETH","nETH",deployer)` ⚠️ VERIFY names (D-6) |
| Invariants | totalSupply = Σ balances. Only the owner can mint. No burn. No cap |
| Monad changes | None |

## 2. NoctrumSwapPool (from GhostSwapPool, verbatim logic)

| Storage | Type |
|---|---|
| `tokenPriceUsd` | `mapping(address=>uint256)`: USD price, 18 dec |
| `supportedTokens` | `mapping(address=>bool)` |
| `tokenList` | `address[]` |

| Function | Access | Behaviour | Reverts (string) |
|---|---|---|---|
| `constructor(address _owner)` | — | Ownable(_owner) | — |
| `addToken(address token, uint256 priceUsd)` | onlyOwner | Marks supported, sets price, pushes to the list, emits `TokenAdded` | "Already added", "Price must be > 0" |
| `setPrice(address token, uint256 priceUsd)` | onlyOwner | Emits `PriceUpdated` | "Token not supported", "Price must be > 0" |
| `addLiquidity(address token, uint256 amount)` | onlyOwner | safeTransferFrom(owner→pool), emits `LiquidityAdded` | "Token not supported" |
| `removeLiquidity(address token, uint256 amount)` | onlyOwner | safeTransfer(pool→owner), emits `LiquidityRemoved` | — (no support check, same as Ghost) |
| `getAmountOut(tokenIn, tokenOut, amountIn) view` | public | `amountIn * priceIn / priceOut` | "Token not supported" |
| `swap(tokenIn, tokenOut, amountIn, minAmountOut)` | external | Checks, then pulls tokenIn, pushes tokenOut, emits `Swapped` | "Same token", "Zero amount", "Slippage exceeded", "Insufficient pool liquidity" |
| `poolBalance(address) view`, `tokenCount() view` | public | — | — |

Events:
- `TokenAdded(address indexed token, uint256 priceUsd)`
- `PriceUpdated(address indexed token, uint256 newPriceUsd)`
- `Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)`
- `LiquidityAdded(address indexed token, uint256 amount)`
- `LiquidityRemoved(address indexed token, uint256 amount)`

Invariants:
- Pool balance never goes below what a swap pays out (enforced by the liquidity check).
- Price is never 0.

No reentrancy guard (as in Ghost; tokens are trusted SimpleTokens).

Deploy script (`08_DeploySwapPool`, same steps):
1. Deploy the pool.
2. `addToken(nUSD, 1e18)` and `addToken(nETH, 2200e18)`.
3. Mint 10,000 nUSD and 10 nETH to the deployer.
4. Approve max, then `addLiquidity` both.

Monad note: the scripted deploy does ~6 txs. Monad charges the **gas limit**, so keep forge's default gas estimation. Do not pass large fixed `--gas-limit`.

## 3. NoctrumVault (new): replacement for the Chainlink CPT vault

> ❌ The Chainlink "Compliant Private Token Demo" vault (`0xE588a6c7…2d13`) and its API exist **only on Ethereum Sepolia**. The API docs list only chainId 11155111 and never mention Monad ([API docs](https://convergence2026-token-api.cldev.cloud/docs)). This section specifies an ABI-compatible replacement so that every Ghost client call works unchanged. Recommended option B in RISKS (D-1). The vault source is not public in the Ghost repo. Everything below comes from what Ghost calls, plus the public API docs. Items marked ⚠️ are our design choices.

### 3.1 ABI that Ghost clients call (must match exactly)
```solidity
function deposit(address token, uint256 amount) external;
function withdrawWithTicket(address token, uint256 amount, bytes calldata ticket) external;
function register(address token, address policyEngine) external;   // scripts 05 / SetupAll
```
The public API docs also list the following. Implement them for completeness; no Ghost client calls them:
```solidity
function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external; // ⚠️ VERIFY exact signature
function checkDepositAllowed(address user, address token, uint256 amount) external view returns (bool);          // ⚠️ VERIFY
function checkWithdrawAllowed(address user, address token, uint256 amount) external view returns (bool);         // ⚠️ VERIFY
function checkPrivateTransferAllowed(address from, address to, address token, uint256 amount) external view returns (bool); // ⚠️ VERIFY
```

### 3.2 Events (from the CPT API docs; keep these exact names/params)
```solidity
event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdraw(address indexed user, address indexed token, uint256 amount, bytes32 indexed withdrawTicketHash);
event TokenRegistered(address indexed token, address indexed policyEngine, address indexed registrar);
event TokenUpdated(address indexed token, address indexed policyEngine, address indexed registrar);
event TokenDeleted(address indexed token, address indexed registrar);
```

### 3.3 Storage (⚠️ design)
| Var | Type | Purpose |
|---|---|---|
| `policyEngineOf` | `mapping(address token => address)` | Registration (zero means not registered) |
| `registrarOf` | `mapping(address token => address)` | Who registered the token (for update/delete) |
| `usedNonce` | `mapping(uint128 => bool)` | Ticket replay protection |
| `ticketSigner` | `address` | Key held by noctrum-vault-api that signs tickets |
| EIP712 | OZ `EIP712("CompliantPrivateTokenDemo","0.0.1")` ⚠️ (D-5: keep the CPT domain name for wire-compat, or rename to `NoctrumPrivateToken`) | Domain for tickets and for vault-API request auth |
| Ownable / AccessControl | — | Admin can rotate `ticketSigner` |

### 3.4 Behaviour
- `register(token, policyEngine)`:
  - Ghost's scripts call it as a normal user (any deployer registered their own token on Chainlink's shared vault).
  - Noctrum: **permissionless first registration**. The registrar can update or delete afterwards ⚠️ (matches the scripts' assumptions). Emits `TokenRegistered`.
  - Reverts if already registered by someone else.
- `deposit(token, amount)`:
  1. Requires a registered token and `amount > 0`.
  2. Calls `IPolicyEngine(pe).check…` ⚠️ (exact ACE call; see §4). It must pass with defaultAllow.
  3. `safeTransferFrom(msg.sender, this, amount)`.
  4. `emit Deposit(msg.sender, token, amount)`.
  
  The vault keeps **no per-user balances** (privacy). The vault-api credits the user off-chain when it indexes the event.
- `withdrawWithTicket(token, amount, ticket)`:
  1. Requires `ticket.length == 89`.
  2. Parse `nonce = uint128(bytes16(ticket[0:16]))`, `deadline = uint64(bytes8(ticket[16:24]))`, `sig = ticket[24:89]`.
  3. Require `block.timestamp <= deadline` and `!usedNonce[nonce]`.
  4. Recover the signer of the EIP-712 struct `WithdrawTicket(address account,address token,uint256 amount,uint128 nonce,uint64 deadline)` ⚠️ with `account = msg.sender`. It must equal `ticketSigner`.
  5. Policy check.
  6. Mark the nonce used, `safeTransfer(msg.sender, amount)`.
  7. `emit Withdraw(msg.sender, token, amount, keccak256(ticket))`.

  Ticket layout matches the CPT spec: "Bytes 0-15 nonce (uint128), 16-23 deadline (uint64), 24-88 signature (bytes65)", expiry 1 hour.

### 3.5 Errors (⚠️ design)
`TokenNotRegistered(address)`, `TokenAlreadyRegistered(address)`, `NotRegistrar(address)`, `ZeroAmount()`, `InvalidTicketLength()`, `TicketExpired(uint64)`, `TicketAlreadyUsed(uint128)`, `InvalidTicketSignature()`, `PolicyCheckFailed(address token, address account)`.

### 3.6 Invariants
- `token.balanceOf(vault)` ≥ Σ(private balances in vault-api for that token) + Σ(outstanding unredeemed tickets). Enforced off-chain by the vault-api; tested in TESTING.
- Each nonce is redeemed at most once.
- Tokens leave the vault only through `withdrawWithTicket`.

### 3.7 Constructor args
`(address initialOwner, address ticketSigner)`.

## 4. ACE PolicyEngine

- Deploy with `script/02_DeployPolicyEngine.s.sol`: new `PolicyEngine()` implementation, then `ERC1967Proxy(impl, abi.encodeWithSelector(PolicyEngine.initialize.selector, true /*defaultAllow*/, deployer))`.
- Source: `lib/chainlink-ace/packages/policy-management/src/core/PolicyEngine.sol` @ v1.0.0.
- ⚠️ VERIFY which PolicyEngine entry point NoctrumVault should call for deposit/withdraw/private-transfer checks. Read `chainlink-ace` v1.0.0 `IPolicyEngine` (e.g. a `check`/`run` with a payload) and the ACE [getting-started guide](https://github.com/smartcontractkit/chainlink-ace/blob/main/getting_started/GETTING_STARTED.md). With `defaultAllow=true` and no policies attached, every check passes.
- Monad: plain EVM contract, no chain-specific dependency. ⚠️ VERIFY that ACE does not hard-code chain IDs.

## 5. Interfaces and library (carried, not implemented)

Copy these with Ghost→Noctrum comment/identifier renames. Signatures and storage layouts stay identical:
- `INoctrumVault` (from `IGhostVault.sol:12-162`): events Deposited/Withdrawn/TokenRegistered/BalanceLocked/BalanceReleased/EmergencyPaused/EmergencyUnpaused; errors; `PauseScope` enum; functions deposit/withdrawWithTicket/register/lockBalance/releaseBalance/views/pause/unpause.
  - Note: this future-design interface is **not** the same as the CPT ABI in §3. `NoctrumVault` must not claim to implement it.
- `ICollateralManager` (`ICollateralManager.sol`): CollateralLock struct `{borrower, token, uint128 amount, uint48 lockedAt, LockStatus}`, events, errors, lock/release/claimExcess/liquidate, views.
- `INoctrumLoanLedger` (`IGhostLoanLedger.sol`): LoanRecord packed into 5 slots, createLoan/createLoanBatch/recordRepayment/markDefaulted, views getLoanHealth/isMatured/totalDebt.
- `ICRECallback`: onMatchAccepted/Batch, onLiquidation, onRepaymentConfirmed, with an attestation `abi.encode(timestamp, nonce, signature)`.
- `InterestAccrual`: `BPS_DENOMINATOR=10_000`, `SECONDS_PER_YEAR=365 days`, `PRECISION=1e18`. Functions computeSimpleInterest, totalDebt, outstandingDebt, healthRatio (max uint if repaid), isUndercollateralized.

## 6. Scripts (renamed copies; `VAULT` constant → env `VAULT_ADDRESS`)

Ghost hard-codes `address constant VAULT = 0xE588…` in scripts 04/05/06/07/SetupAll. Noctrum: `vm.envAddress("VAULT_ADDRESS")`. This is a value change only; behaviour is unchanged.

| Script | Behaviour |
|---|---|
| `00_DeployVault.s.sol` (**new**) | Deploy `NoctrumVault(deployer, TICKET_SIGNER_ADDRESS)` |
| `01_DeployToken` | Deploy `SimpleToken("Noctrum USD","nUSD",deployer)` |
| `02_DeployPolicyEngine` | Impl + proxy, defaultAllow=true |
| `03_MintTokens` | Mint 100e18 to `MINT_TO` (default deployer) |
| `04_ApproveVault` | Approve max |
| `05_RegisterVault` | `register(TOKEN_ADDRESS, POLICY_ENGINE_ADDRESS)` |
| `06_DepositToVault` | Deposit 10e18 |
| `07_WithdrawWithTicket` | Uses `PRIVATE_KEY_2`, `TOKEN_ADDRESS`, `WITHDRAW_AMOUNT`, `TICKET` |
| `08_DeploySwapPool` | As §2 (env `NUSD_ADDRESS`, `NETH_ADDRESS`; Ghost used `GUSD_ADDRESS`/`GETH_ADDRESS`) |
| `SetupAll` | Ghost deploys **"Ghost ETH"/gETH**, mints 1000e18, deposits 100e18. Its log strings say "100"/"10" (Ghost log bug; keep the numbers, fix nothing) |

## 7. Deploy order (Monad Testnet)

1. Fund the deployer with MON from https://faucet.monad.xyz.
2. `00_DeployVault`, giving it `TICKET_SIGNER_ADDRESS` (the vault-api signer). Record `VAULT_ADDRESS`.
3. `02_DeployPolicyEngine`. Record `POLICY_ENGINE_ADDRESS` (proxy).
4. `01_DeployToken` with the nUSD args, then nETH (or `SetupAll` for nETH). Record `NUSD_ADDRESS`, `NETH_ADDRESS`.
5. `05_RegisterVault` for nUSD and for nETH (the same PolicyEngine is fine).
6. `08_DeploySwapPool`. Record `SWAP_POOL_ADDRESS`.
7. Verify every contract (MonadVision/Sourcify and Monadscan; see MONAD_MIGRATION §4).
8. Write the addresses to `deployments/monad-testnet.json` and propagate them (ENV_AND_CONFIG).

## 8. Monad-specific notes for contracts

- Contract size limit is 128 KB, so via-IR builds fit easily.
- Gas is charged on the **limit**. Forge scripts: use `--slow` to avoid nonce races with async execution ([RPC differences](https://docs.monad.xyz/reference/rpc-differences.md): "may not immediately reject transactions with a nonce gap").
- Storage is warmed per 128-slot page; no code change needed.
- `block.timestamp` granularity: blocks are sub-second, but the timestamp is in seconds, so ticket deadline logic is unaffected.
- Blob tx (type 3) is unsupported; not used.
