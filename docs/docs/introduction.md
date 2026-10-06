---
sidebar_position: 1
slug: /
title: Introduction
id: introduction
---

# GHOST Protocol

GHOST (Generalized Heuristic for Obfuscated Settlement and Transfer) is a privacy preserving peer to peer lending protocol built on Chainlink's Confidential Runtime Environment (CRE). It implements sealed bid discriminatory price auctions for interest rate discovery, ensuring that no party other than the Chainlink CRE can observe plaintext lending rates.

## The Problem

Traditional DeFi lending protocols suffer from three fundamental issues:

**Rate transparency enables front running.** When lending rates are visible on chain, sophisticated actors can observe pending rate submissions and strategically position themselves to extract value. Lenders who submit competitive rates get sandwiched by bots that undercut them by minimal amounts.

**Pooled rate models create free rider dynamics.** In protocols like Aave or Compound, all lenders in a pool earn the same blended rate regardless of their individual risk tolerance. Conservative lenders subsidize aggressive ones, and the equilibrium rate does not reflect true market clearing prices.

**On chain state exposes financial positions.** Loan amounts, collateral ratios, and liquidation thresholds are publicly visible, enabling targeted liquidation attacks and competitive intelligence extraction.

## The Solution

GHOST addresses these issues through three mechanisms:

**Sealed bid auctions.** Lenders encrypt their rate bids using the CRE's public key (ECIES on secp256k1). The encrypted bids are stored on the GHOST server, which cannot decrypt them. Only the CRE, running inside a trusted execution environment, can decrypt and process the rates during matching.

**Discriminatory pricing.** Unlike uniform price auctions where all winners pay the same price, GHOST uses discriminatory pricing where each lender earns their individual bid rate. This eliminates free riding and incentivizes truthful bidding, since underbidding reduces earnings while overbidding risks not being matched.

**Three layer separation.** Fund custody (Chainlink vault), intent storage (GHOST server), and rate settlement (CRE) operate in independent trust domains. Compromising any single layer does not break the privacy or safety guarantees of the other two.

## How It Works

1. Lenders deposit funds into the Chainlink Compliant Private Transfer vault and private transfer them to the GHOST pool address
2. Lenders submit encrypted rate bids specifying the interest rate they want to earn
3. Borrowers submit borrow intents specifying the amount needed, collateral offered, and maximum acceptable rate
4. The CRE decrypts all rates inside the TEE, runs the matching engine, and generates match proposals
5. Borrowers accept or reject proposals (rejection incurs a 5% collateral penalty)
6. The CRE executes fund transfers through the vault's private transfer mechanism
7. The CRE continuously monitors collateral health and triggers liquidation when positions become undercollateralized

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Server Framework | Hono |
| Database | MongoDB via Mongoose |
| Confidential Compute | Chainlink CRE SDK |
| Encryption | eciesjs (secp256k1 ECIES) |
| Authentication | EIP 712 typed data signatures |
| Chain | Ethereum Sepolia (chain ID 11155111) |
| Price Feeds | Chainlink Data Streams |
| Fund Custody | Chainlink Compliant Private Transfer Vault |

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `server/` | GHOST API server (Hono + Bun) |
| `ghost-settler/` | CRE workflow definitions (settle, execute, monitor) |
| `e2e-test/` | End to end integration test scripts |
| `frontend/` | Next.js marketing and landing site |
| `client/` | Next.js application frontend |
| `ghost-tg/` | Telegram bot interface |
| `ghost-raycast/` | Raycast extension |
| `transfer-demo/` | Foundry smart contract demos |
| `reference-docs/` | Architecture documents and litepaper |
