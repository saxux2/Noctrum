# Noctrum — Toolchain (T0.3)

Recorded 2026-10-06 on Windows 11 (Git Bash + PowerShell 5.1).

| Tool | Version | Required | Status |
|---|---|---|---|
| bun | 1.3.14 | — | ✅ |
| forge / cast / anvil | 1.8.3 (cae51ad, 2026-09-15) | ≥ 1.8.0 | ✅ |
| CRE CLI (`cre`) | v1.37.0 (2026-10-05) | ≥ 1.30.0 (monad-testnet) | ✅ |
| node | 22.19.0 | — | ✅ |
| npm | 10.9.3 | — | ✅ |
| docker | 29.2.0 | T5.6 | ✅ |

## Install notes
- **CRE CLI is not on npm.** `npm i -g @chainlink/cre-cli` (as written in BUILD_PLAN T0.3) returns 404. Official install: https://docs.chain.link/cre/getting-started/cli-installation/windows.
  It was installed manually from `github.com/smartcontractkit/cre-cli/releases/tag/v1.37.0` (`cre_windows_amd64.zip`, SHA-256 `3ba3ac4c3940bfaf6d4f8e5b039e3b3a8478104ae210b89c3b7a7ba4a3b69b47`, matched against `checksums.txt`) into `%LOCALAPPDATA%\Programs\cre\cre.exe`.
- Foundry lives in `%USERPROFILE%\.foundry\bin`. That folder and the CRE folder were added to the user PATH; open a new terminal to pick them up.

## monad-testnet support
- The `cre` v1.37.0 binary embeds the chain name `monad-testnet` and the selector `2183018362218727504`. Both match CRE_WORKFLOWS §0.
- ✅ VERIFIED 2026-10-06 after `cre login`: `cre workflow supported-chains --output json` → `noctrum-docs/cre-supported-chains.json` lists
  `monad-testnet`, selector `2183018362218727504`, forwarder `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (mock `0xB9F79d863261869B234c481D1f9A7af84AeAd192`).
  This closes the ⚠️ in CRE_WORKFLOWS §0.
- `cre` commands need an active `cre login` session (or `CRE_API_KEY` for non-interactive use).
