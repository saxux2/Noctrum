---
id: careers
slug: /careers
title: Careers
sidebar_label: Careers
sidebar_position: 4
description: Work on NOCTRUM — private P2P lending with sealed-bid rate discovery on Chainlink CRE. How to contribute and get in touch.
---

# Careers

NOCTRUM is built by a small, focused team. **We have no open positions right now.** The best way to work with us is to contribute to the protocol in the open; that is also how we will find the people we hire first.

## What we are building

A lending protocol where interest rates are discovered by a sealed-bid auction instead of a utilisation curve. Rates are encrypted on the client, matched and settled inside Chainlink CRE confidential compute, and funds move through a privacy-preserving vault on Monad. Read the [Litepaper](/litepaper) for the full design and [Research](/research) for the open problems.

## Where help matters most

| Area | What it involves | Start here |
|---|---|---|
| Confidential compute | CRE workflows in TypeScript: matching, transfer execution, loan health | [CRE Workflows](/cre-workflows/overview) |
| Smart contracts | Solidity / Foundry: `NoctrumVault`, Chainlink ACE policy engine, tests | [NoctrumVault](/smart-contracts/noctrum-vault) |
| Cryptography & ZK | Removing the trusted ledger operator; ZK credit attestations | [ZK Vault](/zk-vault/ascv-overview) |
| Mechanism design | Convergence of sealed auctions, loss seniority, credit tiers | [Research](/research#open-questions) |
| Product & tooling | Next.js app, Telegram bot, Raycast extension | [Tools](/tools/telegram-bot) |

## How to contribute

1. Read the [Introduction](/) and run the stack locally ([Running Locally](/development/running-locally)).
2. Pick an open issue on [github.com/saxux2/Noctrum](https://github.com/saxux2/Noctrum/issues), or open one describing what you want to work on.
3. Send a pull request. Keep it focused on one change and include tests where the package has them.

The code is licensed under Apache-2.0.

## Get in touch

Open an issue on [GitHub](https://github.com/saxux2/Noctrum/issues) and introduce yourself: what you would like to work on and links to your previous work. We read every one.
