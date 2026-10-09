"use client";

import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Reveal from "./Reveal";

type Card = { body: string; title: string; meta: string; tag: string; glow?: boolean };

const lenders: Card[] = [
  {
    body: "Pick your rate and encrypt it with the CRE public key before it leaves your browser. The server stores a blob it cannot read, so nobody can front-run your bid or copy your price.",
    title: "Sealed bids",
    meta: "ECIES · secp256k1",
    tag: "CRE",
  },
  {
    body: "You earn exactly the rate you bid. If you ask for 3.5%, you get 3.5% on your matched amount, whatever anyone else asked for. There is no blended pool rate, so there are no free riders.",
    title: "Discriminatory pricing",
    meta: "Your bid, your yield",
    tag: "Yield",
    glow: true,
  },
  {
    body: "Bidding your true rate is the winning strategy. Bid too high and you are filled last; bid too low and you leave yield on the table. Honest prices make a fair market.",
    title: "Truthful by design",
    meta: "Auction theory, onchain",
    tag: "Market",
    glow: true,
  },
  {
    body: "Deposits sit in shielded balances inside the Noctrum vault. Transfers between users happen on a private ledger, and funds only move on your signature or a CRE settlement.",
    title: "Private balances",
    meta: "NoctrumVault on Monad",
    tag: "Vault",
  },
  {
    body: "A health monitor checks every open loan once a minute. Positions that fall below a 1.5× health factor are liquidated, and the seized collateral goes to the lenders on that loan.",
    title: "Liquidation protection",
    meta: "check-loans · 60 s",
    tag: "Safety",
  },
  {
    body: "Change your mind before you are matched and you can cancel your intent at any time. The refund is queued and executed by CRE, so you never depend on an operator to release it.",
    title: "Cancel any time",
    meta: "cancel-lend transfer",
    tag: "Control",
  },
  {
    body: "Matching runs every 30 seconds. Plaintext rates exist only inside the trusted execution environment during that cycle and are wiped as soon as it ends.",
    title: "Ephemeral plaintext",
    meta: "settle-loans · 30 s",
    tag: "TEE",
  },
];

const borrowers: Card[] = [
  {
    body: "Demand is filled from the cheapest lender tick upward. You pay a blended rate across every tick you match, so you always get the lowest price the market will give you.",
    title: "Cheapest-first matching",
    meta: "Tick-based rate discovery",
    tag: "Rates",
  },
  {
    body: "Set the highest rate you will pay. If the blended rate of a match comes in above it, the match is rejected automatically and your collateral stays where it is.",
    title: "Your ceiling, enforced",
    meta: "Max-rate protection",
    tag: "Control",
    glow: true,
  },
  {
    body: "Start at Bronze with 2.0× collateral. Each repayment moves you up a tier, through Silver and Gold to Platinum at 1.2×. A default drops you one level.",
    title: "Credit that compounds",
    meta: "Bronze → Platinum",
    tag: "Tiers",
    glow: true,
  },
  {
    body: "Post nETH as collateral and borrow nUSD. Collateral is valued with Chainlink's ETH/USD price feed, so health checks use the same price everyone can verify.",
    title: "Priced by Chainlink",
    meta: "ETH/USD feed",
    tag: "Oracle",
  },
  {
    body: "A proposal is a commitment. Rejecting a match forfeits 5% of your collateral, which stops anyone from using proposals as free rate discovery.",
    title: "Commitments that count",
    meta: "5% rejection penalty",
    tag: "Fairness",
  },
  {
    body: "Repay the loan and your collateral comes straight back in the same settlement cycle. Lenders are paid their own rates, and your tier moves up.",
    title: "Repay and reclaim",
    meta: "return-collateral-repay",
    tag: "Settle",
  },
  {
    body: "Your borrow intent, your ceiling and your history stay private. Only the matching engine inside the TEE sees what it needs to clear the market.",
    title: "Borrow quietly",
    meta: "Blind storage server",
    tag: "Privacy",
  },
];

function MechanicCard({ c }: { c: Card }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`mb-4 break-inside-avoid rounded-[10px] p-6 ${c.glow ? "panel-glow" : "panel"}`}
    >
      <p className="text-[14.5px] leading-[1.6] text-white/85">{c.body}</p>
      <div className="mt-12 flex items-end justify-between gap-4">
        <div>
          <p className="text-[16px] text-white">{c.title}</p>
          <p className="mt-1 text-[13.5px] text-white/50">{c.meta}</p>
        </div>
        <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70">{c.tag}</span>
      </div>
    </motion.article>
  );
}

const tabs = [
  { id: "lenders", label: "Lenders", cards: lenders },
  { id: "borrowers", label: "Borrowers", cards: borrowers },
] as const;

export default function Mechanics() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("lenders");
  const [expanded, setExpanded] = useState(false);
  const cards = tabs.find((t) => t.id === tab)!.cards;

  return (
    <section className="relative bg-[linear-gradient(180deg,var(--color-ink)_0%,var(--color-ink-2)_18%)] px-5 pt-20 sm:pt-28">
      <Reveal className="mx-auto max-w-4xl text-center">
        <h2 className="display text-[32px] font-light text-white sm:text-[48px] lg:text-[56px]">
          We&apos;re Architecting the Private <br className="hidden sm:block" />
          Credit Layer of Onchain Finance
        </h2>
      </Reveal>

      <Reveal delay={0.05} className="mt-8 flex justify-center">
        <LayoutGroup id="mech-tabs">
          <div role="tablist" className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setExpanded(false);
                }}
                className={`relative rounded-full px-5 py-2 text-[14px] transition-colors ${tab === t.id ? "text-[#0a0a10]" : "text-white/55 hover:text-white/80"}`}
              >
                {tab === t.id && (
                  <motion.span layoutId="mech-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      </Reveal>

      <div className="relative mx-auto mt-12 max-w-[1140px] sm:mt-14">
        <div className={`relative overflow-hidden transition-[max-height] duration-700 ease-out ${expanded ? "max-h-[2400px]" : "max-h-[760px] md:max-h-[640px]"}`}>
          <div className="columns-1 gap-4 md:columns-2 lg:columns-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {cards.map((c) => (
                <MechanicCard key={`${tab}-${c.title}`} c={c} />
              ))}
            </AnimatePresence>
          </div>
          {!expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-[var(--color-ink-2)]" />}
        </div>

        <div className="relative mt-4 flex justify-center">
          <button onClick={() => setExpanded((v) => !v)} className="btn-ghost text-[15px]">
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      </div>
    </section>
  );
}
