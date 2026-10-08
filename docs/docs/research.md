---
id: research
slug: /research
title: Research
sidebar_label: Research
sidebar_position: 3
description: The academic work NOCTRUM builds on — tick-based rate discovery, sealed-bid discriminatory auctions and confidential compute settlement — and the open questions we are working on.
---

# Research

NOCTRUM puts published auction and credit-market research into production. This page lists the work the protocol builds on, what NOCTRUM changes, and the questions that are still open.

## Foundational paper

> **C. Eli and H. Alexandre, "Rate Discovery in Decentralised Lending."**
> *The Journal of The British Blockchain Association*, vol. 8, no. 2, 2025.
> doi: [10.31585/jbba-8-2-(7)2025](https://jbba.scholasticahq.com/article/146833-rate-discovery-in-decentralised-lending)

The paper replaces utilisation-based interest rates (the Aave/Compound model) with a **tick-based auction**. A lending pool is split into discrete rate ticks. Lenders choose the rate they want, and borrowers consume ticks from the cheapest up. The authors' simulations show the rate converging to a market-clearing level that reflects the borrower's real default risk.

**What NOCTRUM takes from it**

- Tick decomposition of lending pools and cheapest-first filling. See [Tick-Based Rates](/mechanics/tick-based-rates).
- **Discriminatory pricing**: every lender earns their own bid rate, not a blended clearing rate. See [Sealed-Bid Auctions](/mechanics/sealed-bid-auctions).
- The lender-utility model, in which a lender's true value rate is set by their private estimate of default probability and the recovery rate.

**What NOCTRUM changes**

The paper assumes an *open* auction: every bid is visible on chain while the book fills. That enables competitive re-bidding, but it also enables front-running, last-second sniping and coordinated manipulation, which the authors list as limitations. NOCTRUM makes the auction **sealed**:

| | Open tick auction (Eli & Alexandre) | NOCTRUM |
|---|---|---|
| Bid visibility | Public during book-building | Encrypted with ECIES to a key held only by Chainlink CRE |
| Price convergence | Within one auction, through re-bidding | Across epochs, as participants learn from past clearing rates |
| Who can read rates | Everyone | Only the CRE workflow, at settlement |
| Manipulation surface | Front-running, sniping, collusion | No observable bids to react to |

The full formal treatment is in the [Litepaper](/litepaper), §2.

## Auction theory and credit markets

These works inform the mechanism's incentive properties:

- **Discriminatory vs uniform pricing.** Z. Monostori, "Discriminatory versus Uniform-Price Auctions," *MNB Occasional Papers*, no. 111, 2014. With enough bidders relative to units, truthful bidding stays a dominant strategy in sealed-bid discriminatory auctions.
- **Collusion under uniform pricing.** E. Myers, A. Bostian and H. Fell, "Asymmetric Cost Pass-Through in Multi-Unit Procurement Auctions: An Experimental Approach," *Journal of Industrial Economics*, vol. 69, 2021.
- **Auction design.** P. Milgrom and R. J. Weber, "A Theory of Auctions and Competitive Bidding," *Econometrica*, vol. 50, 1982; L. M. Ausubel, "An Efficient Ascending-Bid Auction for Multiple Objects," *American Economic Review*, vol. 94, no. 5, 2004; P. Klemperer, "Auctions: Theory and Practice," 2004.
- **Treasury auction evidence.** D. Goldreich, "Underpricing in Discriminatory and Uniform-Price Treasury Auctions," *Journal of Financial and Quantitative Analysis*, vol. 42, no. 2, 2007.
- **Credit rationing.** J. E. Stiglitz and A. Weiss, "Credit Rationing in Markets with Imperfect Information," *American Economic Review*, vol. 71, no. 3, 1981; H. Bester, "Screening vs. Rationing in Credit Markets with Imperfect Information," *American Economic Review*, vol. 75, no. 4, 1985. These motivate collateral as a screening device, which NOCTRUM implements through [credit tiers](/incentives/credit-tiers).

## Open questions

These are the problems we are actively working on. Contributions and discussion are welcome on [GitHub](https://github.com/saxux2/Noctrum/issues).

1. **Convergence across epochs.** A sealed auction gives up within-auction re-bidding. How fast do clearing rates converge when participants only learn from past matches, and should NOCTRUM publish delayed, aggregated clearing rates to speed this up without leaking live bids?
2. **Loss seniority.** Liquidation recovery is currently pro rata by principal. In the discriminatory model, higher-rate ticks were paid to take more risk and could absorb losses first. What seniority rule keeps lender incentives truthful? See [Liquidation](/incentives/liquidation).
3. **Private credit attestations.** Credit tiers are endogenous (repayment history only). Zero-knowledge credit proofs could let borrowers carry reputation across protocols without revealing their history.
4. **Removing the ledger operator.** The private ledger (`noctrum-vault-api`) is a trusted service today. The [ZK Vault](/zk-vault/ascv-overview) design and moving the ledger into CRE are two paths to remove that trust.
