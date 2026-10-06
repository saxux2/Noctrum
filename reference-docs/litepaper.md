# GHOST Protocol: Privacy-Preserving Rate Discovery for Decentralised Lending

**A Sealed-Bid Discriminatory Auction Framework with Confidential Compute Settlement**

---

## Abstract

Decentralised lending today suffers from a fundamental tension: rate transparency enables market efficiency but invites strategic manipulation, front-running, and collusion. We present GHOST (General Hosting of Sealed Ticks), a protocol that resolves this tension by combining sealed-bid discriminatory-price auctions with confidential compute execution. Lenders submit rate bids encrypted under a secp256k1 public key held by a Chainlink Confidential Runtime Environment (CRE) node. Neither the storage layer, other participants, nor any single node operator can observe plaintext rates. Matching, rate validation, and fund disbursement occur entirely within the CRE's trusted execution boundary, producing a system where price discovery is both market-driven and manipulation-resistant. GHOST achieves what open order books cannot: truthful rate revelation without the attack surface of public bids.

---

## 1. Introduction

The dominant interest rate model in DeFi — pioneered by Aave and Compound — computes borrowing rates algorithmically from pool utilisation:

$$R_t = R_0 + R_{\text{slope}_1} \cdot \frac{U}{U_{\text{optimal}}} \quad \text{if } U \leq U_{\text{optimal}}$$

This mechanism, while elegant, conflates liquidity risk with credit risk. All borrowers pay the same rate regardless of creditworthiness. The rate reflects how much capital is available, not whether the borrower deserves it. For protocols aspiring to support under-collateralised or variable-collateral lending — where default probability is nonzero and heterogeneous — this is insufficient.

Eli and Alexandre (2025) proposed a tick-based auction framework where lending pools are decomposed into discrete rate ticks, each representing a sub-pool at a specific interest rate. Lenders select their rate; borrowers consume ticks cheapest-first. Their simulations demonstrate convergence to a market-clearing rate that reflects the borrower's true default probability, with speed proportional to information disclosure.

However, their model assumes an *open* auction: all bids are visible on-chain throughout the book-building phase. While this enables competitive re-bidding, it also creates vulnerability to front-running, last-second sniping, and coordinated rate manipulation — precisely the market frictions the authors acknowledge as limitations.

GHOST resolves this by making the auction *sealed*. Every rate bid — both lender rates and borrower maximum rates — is encrypted client-side with a public key whose corresponding private key exists only inside a Chainlink CRE workflow. The server that stores these bids is architecturally incapable of reading them. Decryption, matching, and settlement execute atomically within the CRE's confidential boundary, inheriting the security guarantees of Chainlink's Decentralised Oracle Network (DON) infrastructure.

The result is a lending protocol where:

- Rates are market-discovered, not algorithmically imposed.
- Each lender earns their own bid rate (discriminatory pricing), eliminating free-riding.
- No participant — including the protocol operator — observes rates before settlement.
- Fund custody is non-custodial, mediated by a privacy-preserving vault layer with compliance enforcement.

---

## 2. Theoretical Foundation

### 2.1 Tick-Based Rate Decomposition

We adopt the lending pool formalism of Eli and Alexandre (2025). A lending pool $LP_{B}$ for borrower class $B$ consists of $n$ ticks $\{r_1, r_2, \ldots, r_n\}$ with $0 < r_1 < r_2 < \cdots < r_n$, where each tick $r_i$ holds cumulative deposit volume $d_i \geq 0$. The cumulative deposit function is:

$$CD_{r_i} = \sum_{j=1}^{i} d_j$$

A borrower seeking principal $K$ consumes ticks in ascending rate order. The set of fill fractions $(\delta_1, \delta_2, \ldots, \delta_n)$ is determined by:

$$\min \sum_{i} \delta_i \cdot r_i \quad \text{subject to} \quad \sum_{i} \delta_i = K, \quad 0 \leq \delta_i \leq d_i$$

The borrower's effective (blended) rate is:

$$R_{\text{eff}} = \frac{\sum_{i} \delta_i \cdot r_i}{K}$$

Under discriminatory pricing, each lender $k$ at tick $r_i$ receives exactly $r_i$ on their matched principal — not the blended rate. This preserves individual price signals and eliminates the payoff-irrelevance of infra-marginal bids that enables collusion in uniform-price auctions (Myers et al., 2021).

### 2.2 Lender Utility and Truthful Bidding

Lender $k$ evaluates a private default probability $p_{k,B}$ for borrower class $B$, with recovery rate $RR$. Their expected utility from depositing $m$ tokens at tick $r_i$ is:

$$u_{\text{lender},k}(m, r_i) = m \cdot \left[(1 - p_{k,B}) \cdot r_i - p_{k,B} \cdot (1 - RR)\right] \cdot \mathbf{1}_{CD_{r_i} \leq K}$$

The indicator function captures the matching constraint: the lender earns only if their tick is consumed. The lender's *true value rate* $r_k^*$ — the minimum rate at which lending yields non-negative expected utility — satisfies:

$$r_k^* = \frac{p_{k,B} \cdot (1 - RR)}{1 - p_{k,B}}$$

In an open auction with sufficient liquidity ($CD_{r^* + \epsilon} > K$), lenders are incentivised to bid at $r_k^*$, as underbidding risks negative expected returns while overbidding risks exclusion. GHOST preserves this equilibrium property while removing the information leakage that open auctions entail.

### 2.3 The Sealed-Bid Extension

In GHOST, lender bids are not observable during the book-building phase. Each lender encrypts their rate $r_i$ as:

$$c_i = \text{ECIES}_{\text{encrypt}}(pk_{\text{CRE}}, r_i)$$

where $pk_{\text{CRE}}$ is the secp256k1 public key of the CRE workflow. The storage layer observes only the ciphertext $c_i$. Since bids are invisible to other participants, the competitive re-bidding dynamic of the open model is replaced by a one-shot sealed-bid mechanism.

In sealed-bid discriminatory auctions, truthful bidding remains a dominant strategy under the condition that the number of bidders is sufficiently large relative to the number of units (Monostori, 2014). The discriminatory format further discourages strategic bid shading: each lender's payoff depends solely on their own bid, not on any clearing price.

The borrower similarly encrypts their maximum acceptable rate:

$$c_{\max} = \text{ECIES}_{\text{encrypt}}(pk_{\text{CRE}}, R_{\max})$$

The CRE decrypts both sides and validates $R_{\text{eff}} \leq R_{\max}$ within its confidential execution boundary. No party outside the CRE ever observes plaintext rates.

### 2.4 Borrower Utility and the Acceptance Mechanism

The borrower's utility from accepting a proposal with blended rate $R_{\text{eff}}$ is:

$$u_{\text{borrower}} = K \cdot (ROI - R_{\text{eff}})$$

where $ROI$ is the borrower's expected return on the borrowed capital. The borrower accepts if $R_{\text{eff}} \leq R_{\max} \leq ROI$.

To prevent frivolous borrowing and ensure credible participation, GHOST requires borrowers to post collateral $C$ satisfying:

$$C \geq K \cdot \mu(\tau)$$

where $\mu(\tau)$ is a collateral multiplier indexed by credit tier $\tau \in \{\text{bronze}, \text{silver}, \text{gold}, \text{platinum}\}$. The multiplier schedule — $\mu_{\text{bronze}} = 2.0$, $\mu_{\text{silver}} = 1.8$, $\mu_{\text{gold}} = 1.5$, $\mu_{\text{platinum}} = 1.2$ — decreases as the borrower demonstrates repayment history, creating an endogenous reputation mechanism.

For cross-asset collateral (e.g., ETH collateral against a USD-denominated loan), the requirement adjusts via a real-time price oracle:

$$C_{\text{ETH}} \geq \frac{K \cdot \mu(\tau)}{P_{\text{ETH/USD}}}$$

where $P_{\text{ETH/USD}}$ is sourced from a Chainlink price feed.

---

## 3. Protocol Architecture

GHOST implements a three-layer separation of concerns, each operating under distinct trust assumptions.

### 3.1 Layer 1: Privacy-Preserving Custody (External)

All fund custody is delegated to a Chainlink Compliant Private Transfer vault deployed on Ethereum Sepolia. This layer provides:

- **Shielded addresses**: Unlinkable recipient identifiers that prevent sender-recipient correlation.
- **Private transfers**: Off-chain balance mutations validated against an on-chain PolicyEngine (Chainlink ACE) via `eth_call`, exposing no transaction metadata on-chain.
- **Withdrawal tickets**: Signed authorisations redeemable on-chain within a time-bound window.
- **Compliance enforcement**: Every transfer is checked against configurable policy rules without revealing transaction details publicly.

The vault holds all deposited tokens. GHOST never takes direct custody — it orchestrates movements through a pool wallet that signs EIP-712 typed-data messages against the vault's API.

The proof-of-concept operates with two synthetic assets registered on the vault: **gUSD**, a USD-pegged stablecoin used as the primary lending denomination, and **gETH**, a synthetic ether token used as borrower collateral. Lenders deposit gUSD into tick positions at their chosen rate; borrowers post gETH collateral valued against a live Chainlink ETH/USD price feed. This two-token design captures the essential cross-asset dynamics of real lending markets — currency risk in collateral valuation, liquidation threshold monitoring, and the need for oracle-sourced pricing — while remaining tractable for confidential compute execution within CRE's WASM runtime.

### 3.2 Layer 2: Blind Storage (GHOST Server)

The GHOST API server (Hono + Bun) functions as a deliberately blind storage layer. It maintains in-memory state — deposit slots, lend intents, borrow intents, match proposals, active loans, pending transfers, and credit scores — but is architecturally excluded from rate information.

All user-facing endpoints authenticate via EIP-712 typed-data signatures with timestamp validation ($\pm 5$ minutes) to prevent replay attacks. The server stores encrypted rate blobs, queues fund movement instructions, and tracks loan lifecycle state. It cannot decrypt rates, cannot execute matching, and cannot disburse funds autonomously.

This design is intentional: by making the storage layer cryptographically blind, we eliminate the protocol operator as a threat vector. Even full database compromise reveals no rate information.

### 3.3 Layer 3: Confidential Settlement Engine (Chainlink CRE)

The Chainlink Confidential Runtime Environment serves as the protocol's settlement brain. Three independent CRE workflows, each executing as cron-triggered DON jobs, orchestrate the lending lifecycle:

**Workflow 1 — Rate Discovery and Matching** (30-second epoch).
The workflow retrieves all pending lend and borrow intents, decrypts their sealed rates using the CRE-held private key ($sk_{\text{CRE}}$), and executes the tick-matching algorithm. Borrows are sorted by principal descending (largest-$K$-first); lends are sorted by rate ascending (cheapest-first). For each borrow, the engine greedily fills from cheapest available ticks, computes $R_{\text{eff}}$, and validates against the borrower's decrypted $R_{\max}$. Successful matches produce proposals posted back to the server.

**Workflow 2 — Transfer Execution** (15-second cycle).
Pending fund movements — disbursements, collateral returns, lender payouts, liquidation distributions — are polled from the server and executed via EIP-712-signed private transfers through the vault API. The pool wallet's private key is stored as a Chainlink Vault DON secret, threshold-encrypted across DON nodes such that no single node possesses the complete key.

**Workflow 3 — Loan Health Monitoring** (60-second cycle).
Active loans are checked against collateralisation requirements using real-time ETH/USD pricing from a Chainlink price feed on Arbitrum. Loans exceeding maturity or falling below the liquidation threshold ($\frac{C \cdot P_{\text{ETH/USD}}}{K} < 1.5$) are flagged for liquidation.

All three workflows communicate with the server via `ConfidentialHTTPClient` — Chainlink's end-to-end encrypted HTTP primitive where requests and responses are encrypted between the workflow and the endpoint, preventing individual DON node operators from observing payload contents.

---

## 4. Matching Algorithm

The epoch-based matching engine operates within CRE Workflow 1. Let $\mathcal{L} = \{l_1, \ldots, l_m\}$ denote the set of active lend intents and $\mathcal{B} = \{b_1, \ldots, b_q\}$ the pending borrow intents. After decryption:

**Step 1.** Sort $\mathcal{B}$ by $K_j$ descending. Sort $\mathcal{L}$ by $r_i$ ascending.

**Step 2.** For each $b_j \in \mathcal{B}$, initialise $\text{filled}_j = 0$, $\text{weightedSum}_j = 0$, and tick list $\mathcal{T}_j = \emptyset$.

**Step 3.** Iterate over $\mathcal{L}$. For each $l_i$ with remaining capacity $a_i > 0$ and matching token:

$$\text{take} = \min(a_i, K_j - \text{filled}_j)$$

$$\text{filled}_j \mathrel{+}= \text{take}, \quad \text{weightedSum}_j \mathrel{+}= \text{take} \cdot r_i, \quad a_i \mathrel{-}= \text{take}$$

Append $(l_i, \text{take}, r_i)$ to $\mathcal{T}_j$. If $\text{filled}_j = K_j$, break.

**Step 4.** Compute $R_{\text{eff},j} = \frac{\text{weightedSum}_j}{\text{filled}_j}$. If $R_{\text{eff},j} \leq R_{\max,j}$, emit proposal $P_j = (b_j, \mathcal{T}_j, R_{\text{eff},j})$. Otherwise, release all ticks in $\mathcal{T}_j$ back to $\mathcal{L}$.

This greedy approach prioritises larger borrows, reflecting the paper's insight that larger borrowers exert greater price discovery pressure and attract more competitive tick pricing. The algorithm runs in $O(|\mathcal{B}| \cdot |\mathcal{L}|)$ time, well within CRE execution budgets for practical market sizes.

---

## 5. Incentive Mechanisms

### 5.1 Rejection Penalty

A borrower who receives a valid proposal (where $R_{\text{eff}} \leq R_{\max}$) and rejects it incurs a 5% collateral slash:

$$\text{penalty} = 0.05 \cdot C, \quad \text{refund} = 0.95 \cdot C$$

This prevents borrowers from using proposals as free option quotes — submitting borrow intents to observe market-clearing rates without commitment. The slashed amount remains in the protocol pool.

### 5.2 Auto-Acceptance and Timeout

Proposals carry a time-to-live window. If the borrower neither accepts nor rejects within this window, the proposal is automatically accepted and the loan is originated. This prevents indefinite tick-locking that would deny lenders liquidity.

### 5.3 Credit Tier Dynamics

The collateral multiplier $\mu(\tau)$ evolves based on borrower behaviour:

- **Successful repayment**: $\tau \leftarrow \text{upgrade}(\tau)$, reducing future collateral requirements.
- **Default or liquidation**: $\tau \leftarrow \text{downgrade}(\tau)$, increasing future requirements.

This creates a self-reinforcing reputation loop: reliable borrowers access cheaper leverage, while defaulters face progressively stricter terms — analogous to traditional credit scoring but implemented entirely on-chain without centralised assessment.

### 5.4 Liquidation and Loss Distribution

When a loan's health ratio breaches the liquidation threshold, the protocol seizes collateral and distributes it as follows:

$$\text{protocol fee} = 0.05 \cdot C, \quad \text{lender}_i\text{ share} = 0.95 \cdot C \cdot \frac{\delta_i}{\sum_i \delta_i}$$

Lender recovery is pro-rata by principal contribution. This aligns with the discriminatory pricing philosophy: lenders who accepted higher risk (lower-rate ticks with larger fills) receive proportionally larger recovery amounts.

---

## 6. Privacy Model

GHOST achieves a layered privacy architecture where information is compartmentalised by role:

| Data | Public Chain | GHOST Server | CRE |
|---|---|---|---|
| Vault deposits | Visible | — | — |
| Private transfer amounts | Hidden | Known (for bookkeeping) | Known |
| Lender rates | Hidden | Encrypted ciphertext | Plaintext (at settlement) |
| Borrower max rate | Hidden | Encrypted ciphertext | Plaintext (at settlement) |
| Matched tick allocations | Hidden | Recorded post-match | Known at match time |
| Loan terms | Hidden | Recorded | Known |

The critical invariant is that **no single entity possesses both the encrypted rates and the decryption key**. The server holds ciphertexts but not $sk_{\text{CRE}}$. The CRE holds $sk_{\text{CRE}}$ but does not persist state beyond execution. Individual DON nodes participating in CRE consensus never see the full private key — it is threshold-encrypted via Vault DON Secrets, requiring a quorum to reconstruct.

Rate encryption uses ECIES on the secp256k1 curve (eciesjs v0.4), which provides IND-CCA2 security. Each encryption is randomised, so identical rates produce distinct ciphertexts, preventing frequency analysis.

---

## 7. Role of Chainlink Infrastructure

GHOST is designed as a native CRE application, leveraging multiple Chainlink services as composable infrastructure primitives:

**CRE Workflows** provide the confidential compute environment where rate decryption and matching execute with cryptographic isolation. The WASM-based runtime supports pure-JavaScript cryptographic libraries (eciesjs, @noble/curves, viem), enabling complex financial logic — EIP-712 signing, ECIES decryption, multi-tick matching — within a single workflow execution.

**ConfidentialHTTPClient** ensures that all communication between CRE workflows and external services is end-to-end encrypted. Server endpoints receiving CRE requests cannot distinguish individual DON node traffic, and DON nodes cannot read the payload contents — only the CRE execution context and the destination endpoint observe plaintext.

**Vault DON Secrets** store the CRE private key and pool wallet key as threshold-encrypted secrets distributed across DON nodes. Reconstruction requires DON consensus, preventing single-node key extraction.

**Chainlink Price Feeds** provide real-time ETH/USD pricing for cross-asset collateral valuation and liquidation threshold monitoring, sourced from the Arbitrum L2 deployment for cost efficiency.

**Chainlink ACE (Automated Compliance Engine)** enforces policy rules on every private transfer through the vault's PolicyEngine contract, enabling regulatory compliance without exposing transaction details on-chain.

This composability is foundational: GHOST does not merely use Chainlink as an oracle — it delegates its most security-critical operations (key custody, rate decryption, fund execution, compliance checking) to Chainlink's decentralised infrastructure, inheriting its liveness and security guarantees.

---

## 8. Discussion

### 8.1 Trade-offs of Sealed vs. Open Auctions

The Eli-Alexandre model achieves rate convergence through iterative re-bidding: lenders observe the order book and adjust rates competitively. GHOST's sealed-bid design sacrifices this iterative convergence for manipulation resistance. In practice, we expect convergence to emerge across epochs rather than within a single auction — as market participants learn clearing rates from past loan originations and calibrate future bids accordingly.

### 8.2 Capital Efficiency

The tick-based model requires total liquidity $CD_{r_n} > K$ for competitive rate discovery. GHOST addresses this through continuous matching: lend intents persist across epochs until matched or cancelled, creating a standing liquidity book that grows over time. The credit tier system further improves capital efficiency by reducing collateral requirements for proven borrowers.

### 8.3 Limitations and Future Work

The current implementation uses in-memory state, suitable for proof-of-concept but requiring persistent storage for production. The credit scoring mechanism is endogenous and simple — future iterations could integrate verifiable credential systems or zero-knowledge proof-based credit attestations. Multi-token lending pools, variable maturity structures, and secondary market trading of matched tick positions represent natural extensions.

---

## 9. Conclusion

GHOST demonstrates that privacy and market efficiency in decentralised lending are not mutually exclusive. By combining the tick-based rate discovery framework of Eli and Alexandre with Chainlink CRE's confidential compute capabilities, the protocol achieves sealed-bid price discovery with discriminatory settlement — a mechanism that incentivises truthful rate revelation while eliminating the front-running, sniping, and collusion vectors inherent in open on-chain auctions.

The protocol's architecture — a blind storage layer, a privacy-preserving custody layer, and a confidential settlement engine — establishes a separation of concerns where no single component possesses sufficient information to compromise rate privacy or manipulate matching outcomes. This design pattern, enabled by Chainlink's composable infrastructure stack, points toward a broader class of DeFi applications where sensitive financial logic can execute with institutional-grade confidentiality guarantees on decentralised infrastructure.

---

## References

1. C. Eli and H. Alexandre, "Rate Discovery in Decentralised Lending," *Journal of The British Blockchain Association*, vol. 8, no. 2, 2025.

2. J. E. Stiglitz and A. Weiss, "Credit Rationing in Markets with Imperfect Information," *American Economic Review*, vol. 71, no. 3, pp. 393–410, 1981.

3. H. Bester, "Screening vs. Rationing in Credit Markets with Imperfect Information," *American Economic Review*, vol. 75, no. 4, pp. 850–855, 1985.

4. Z. Monostori, "Discriminatory versus Uniform-Price Auctions," *MNB Occasional Papers*, no. 111, 2014.

5. E. Myers, A. Bostian, and H. Fell, "Asymmetric Cost Pass-Through in Multi-Unit Procurement Auctions: An Experimental Approach," *Journal of Industrial Economics*, vol. 69, pp. 109–130, 2021.

6. L. M. Ausubel, "An Efficient Ascending-Bid Auction for Multiple Objects," *American Economic Review*, vol. 94, no. 5, pp. 1452–1475, 2004.

7. P. Milgrom and R. J. Weber, "A Theory of Auctions and Competitive Bidding," *Econometrica*, vol. 50, pp. 1089–1122, 1982.

8. D. Goldreich, "Underpricing in Discriminatory and Uniform-Price Treasury Auctions," *Journal of Financial and Quantitative Analysis*, vol. 42, no. 2, pp. 443–466, 2007.

9. P. Klemperer, "Auctions: Theory and Practice," *SSRN Electronic Journal*, 2004.

---

*GHOST Protocol — Built on Chainlink CRE, Compliant Private Transfer, ACE, and Price Feeds.*
