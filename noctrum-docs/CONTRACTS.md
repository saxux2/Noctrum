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
- Add `use_literal_content = true`, `chain_id = 10143`. The guide also lists `metadata = true` / `metadata_hash = "none"`, but those are **not Foundry keys** (forge 1.8.3 warns "unknown config" and ignores them). Foundry's defaults (`cbor_metadata = true`, `bytecode_hash = "ipfs"`) are kept, as in Ghost; they give Sourcify a full match. (Found in T1.4, 2026-10-06.)
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

### 3.0 Source of truth (✅ verified 2026-10-06)
The Sepolia CPT vault `0xE588…2d13` is verified on Sourcify as `DemoCompliantPrivateTokenVault` (solc 0.8.30, BUSL-1.1). Its ABI, ticket struct and policy payloads were read from that source. `NoctrumVault` is an independent MIT implementation (no BUSL code copied) that matches it on the wire. The intended differences are listed in §3.4.

### 3.1 ABI (✅ matches CPT exactly)
```solidity
function register(address token, address policyEngine) external;   // scripts 05 / SetupAll; policyEngine = 0 deletes
function deposit(address token, uint256 amount) external;
function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
function withdrawWithTicket(address token, uint256 amount, bytes calldata ticket) external;
function checkDepositAllowed(address depositor, address token, uint256 amount) external view;                 // reverts if rejected (no return value)
function checkWithdrawAllowed(address withdrawer, address token, uint256 amount) external view;               // reverts if rejected
function checkPrivateTransferAllowed(address from, address to, address token, uint256 amount) external view; // reverts if rejected
```
Getters are named differently from CPT; no Ghost client reads them: `policyEngineOf` (CPT `sPolicyEngines`), `registrarOf` (`sRegistrars`), `ticketSigner` (`I_WITHDRAW_TICKET_SIGNER`). Extras: `usedNonce(uint128)`, `hashWithdrawTicket(withdrawer,token,amount,nonce,deadline)`, `setTicketSigner(address)` (onlyOwner), `WITHDRAW_TICKET_TYPEHASH`, `TICKET_LENGTH`, Ownable, `eip712Domain()`.

### 3.2 Events (✅ exact CPT signatures)
```solidity
event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdraw(address indexed user, address indexed token, uint256 amount, bytes32 indexed withdrawTicketHash); // = EIP-712 digest
event TokenRegistered(address indexed token, address indexed policyEngine, address indexed registrar);
event TokenUpdated(address indexed token, address indexed policyEngine, address indexed registrar);
event TokenDeleted(address indexed token, address indexed registrar);
event TicketSignerUpdated(address indexed previousSigner, address indexed newSigner); // Noctrum only
```

### 3.3 Storage and EIP-712
| Var | Type | Purpose |
|---|---|---|
| `policyEngineOf` | `mapping(address token => address)` | Registration (zero means not registered) |
| `registrarOf` | `mapping(address token => address)` | Who registered the token (only it can update/delete) |
| `usedNonce` | `mapping(uint128 => bool)` | Ticket replay protection (global nonce space) |
| `ticketSigner` | `address` | Key held by noctrum-vault-api; owner can rotate |
| `_engineTokenCount` | `mapping(address engine => uint256)` (private) | ACE attach ref-count (see §4) |

EIP-712 domain: `EIP712("NoctrumPrivateToken", "0.0.1")` (D-5), chainId 10143, verifyingContract = vault.
Ticket struct (✅ same as CPT): `WithdrawTicket(address withdrawer,address token,uint256 amount,uint128 nonce,uint64 deadline)`, with `withdrawer = msg.sender`.
Ticket bytes: `nonce` (16, big-endian) ‖ `deadline` (8) ‖ `r` (32) ‖ `s` (32) ‖ `v` (1) = 89 bytes. Expiry chosen by the vault-api (1 h).

### 3.4 Behaviour
- `register(token, policyEngine)` (same rules as CPT): first-come; a different caller reverts `TokenAlreadyRegistered(token, registrar)`; the registrar calling again updates (`TokenUpdated`); `policyEngine = 0` deletes (`TokenDeleted`; reverts `TokenNotRegistered` if nothing to delete). The vault `attach()`es to the engine on registration and `detach()`es on delete/change.
  - **Difference from CPT:** attachment is ref-counted per engine, so one PolicyEngine can guard several tokens (CPT reverts `TargetAlreadyAttached` on the second token). Needed for §7 step 5 ("the same PolicyEngine is fine").
- `deposit(token, amount)` / `depositWithPermit`: requires registration and `amount > 0` (**difference:** CPT allows 0) → `PolicyEngine.run(payload)` → `safeTransferFrom` → `Deposit`. `depositWithPermit` ignores a failing `permit` (front-run safe; the transfer still needs allowance). No per-user balances.
- `withdrawWithTicket(token, amount, ticket)`: registration, `amount > 0`, length 89, `block.timestamp <= deadline`, `!usedNonce[nonce]`, signer == `ticketSigner` (OZ `tryRecoverCalldata`; malleable `s` rejected) → mark nonce → `PolicyEngine.run` → `safeTransfer` → `Withdraw(…, digest)`.
  - **Difference from CPT:** replay is keyed by nonce (CPT: by digest), so a nonce is single-use across all accounts and amounts. The vault-api must generate unique 128-bit nonces.
- Policy payloads (✅ same as CPT, so CPT-style ACE policies work): `selector` = `deposit(address,address,uint256)` / `withdraw(address,address,uint256)` / `privateTransfer(address,address,address,uint256)`; `sender` = the user (`from` for transfers); `data` = `abi.encode(user, token, amount)` (`abi.encode(from,to,token,amount)` for transfers); `context` = "". ACE reverts (`PolicyRunRejected`, …) bubble up unchanged.
- **Difference from CPT:** the policy check runs before the token transfer (CPT transfers first). This is atomic either way.

### 3.5 Errors
`TokenNotRegistered(address token)`, `TokenAlreadyRegistered(address token, address registrar)`, `ZeroAmount()`, `ZeroTicketSigner()`, `InvalidTicketLength()`, `TicketExpired(uint64 deadline)`, `TicketAlreadyUsed(uint128 nonce)`, `InvalidTicketSignature()`, plus OZ (`SafeERC20FailedOperation`, `OwnableUnauthorizedAccount`, …) and ACE errors. CPT uses `require` strings; Ghost clients do not decode vault errors.

### 3.6 Invariants
- `token.balanceOf(vault)` ≥ Σ(private balances in vault-api for that token) + Σ(outstanding unredeemed tickets). Enforced off-chain by the vault-api; tested in TESTING.
- Each nonce is redeemed at most once.
- Tokens leave the vault only through `withdrawWithTicket`.

### 3.7 Constructor args
`(address initialOwner, address ticketSigner)`.

## 4. ACE PolicyEngine

- Deploy with `script/02_DeployPolicyEngine.s.sol`: new `PolicyEngine()` implementation, then `ERC1967Proxy(impl, abi.encodeWithSelector(PolicyEngine.initialize.selector, true /*defaultAllow*/, deployer))`.
- Source: `lib/chainlink-ace/packages/policy-management/src/core/PolicyEngine.sol` @ v1.0.0.
- ✅ Verified 2026-10-06 (v1.0.0 source): the vault calls `run(Payload)` on deposit/withdraw and `check(Payload)` (view) in the `check*Allowed` dry-runs. Both revert `TargetNotAttached(msg.sender)` unless the vault has called `attach()` on the engine, and `attach()` reverts if already attached, so NoctrumVault attaches on register (ref-counted, §3.4). With `defaultAllow=true` and no policies attached, every check passes.
- Monad: plain EVM contract, no chain-specific dependency. ✅ ACE v1.0.0 never reads `block.chainid` (it appears only in factory comments).

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

✅ **Deployed 2026-10-06 (T3.1)**, from block 68685729. Addresses are in `deployments/monad-testnet.json`. All 8 contracts are Sourcify-verified on MonadVision (`runtimeMatch: match`). Monadscan verification was skipped because no `MONADSCAN_API_KEY` was set (D-14: MonadVision).
- `SetupAll` deploys its own PolicyEngine for nETH (Ghost parity), so nUSD and nETH use different engines. Both are recorded (`PolicyEngineProxy` for nUSD, `nETHPolicyEngineProxy` for nETH).
- Total cost was about 1.57 MON, since Monad charges gas on the limit.
- Fork smoke test: `forge test --match-contract MonadForkTest --fork-url https://testnet-rpc.monad.xyz`. It is skipped without a fork.

## 8. Monad-specific notes for contracts

- Contract size limit is 128 KB, so via-IR builds fit easily.
- Gas is charged on the **limit**. Forge scripts: use `--slow` to avoid nonce races with async execution ([RPC differences](https://docs.monad.xyz/reference/rpc-differences.md): "may not immediately reject transactions with a nonce gap").
- Storage is warmed per 128-slot page; no code change needed.
- `block.timestamp` granularity: blocks are sub-second, but the timestamp is in seconds, so ticket deadline logic is unaffected.
- Blob tx (type 3) is unsupported; not used.
