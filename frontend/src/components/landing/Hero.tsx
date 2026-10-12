"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { links } from "@/constants/links";
import MetalCoin, { type CoinGlyph } from "./MetalCoin";

const coins: { glyph: CoinGlyph; label: string }[] = [
  { glyph: "nusd", label: "nUSD" },
  { glyph: "monad", label: "Monad" },
  { glyph: "noctrum", label: "Noctrum" },
  { glyph: "chainlink", label: "Chainlink" },
  { glyph: "ethereum", label: "Ethereum" },
];

// Proportions measured from the design reference and scaled with viewport width.
const COIN = "clamp(72px, 6.6vw, 128px)";

// Back cards of the skewed glass stack, back to front.
const CARDS = 13;
const backCards = Array.from({ length: CARDS }, (_, k) => CARDS - k).map((i) => ({ x: 14 + i * 24, y: 150 - i * 2 }));

const ease = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-[clamp(132px,15vw,300px)]">
      {/* copy */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-5 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease }}
          className="mx-auto text-balance text-[clamp(38px,4.2vw,84px)] font-normal leading-[1.24] tracking-[-0.012em] text-white"
        >
          The Private Lending Market <br />
          for Onchain Capital.
        </motion.h1>
      </div>

      {/* horizon + coins */}
      <div className="relative mt-[clamp(28px,3.6vw,72px)]">
        <div className="relative">
          <div className="horizon-glow" />
          {/* the planet: its rim crosses the coins just below their middle */}
          <div className="pointer-events-none absolute inset-x-0 top-[42%] h-[1400px]">
            <div className="horizon" />
          </div>
          <div className="horizon-flare" />
          <div className="relative z-10 flex justify-center">
            <div className="flex items-center" style={{ paddingLeft: `calc(${COIN} * 0.32)` }}>
              {coins.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, delay: 0.25 + i * 0.08, ease }}
                  className="metal-coin-slot"
                  style={{ zIndex: i + 1, width: COIN, height: COIN, marginLeft: `calc(${COIN} * -0.32)` }}
                >
                  <MetalCoin glyph={c.glyph} label={c.label} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease }}
          className="relative z-10 mt-[clamp(36px,5vw,104px)] flex flex-wrap items-center justify-center gap-[clamp(12px,1.2vw,24px)] px-5"
        >
          <a href={links.app} target="_blank" rel="noopener noreferrer" className="btn-primary btn-lg">
            Launch App <ArrowUpRight className="h-[1em] w-[1em]" />
          </a>
          <a href={links.litepaper} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-lg">
            Read Litepaper
          </a>
        </motion.div>

        {/* skewed glass card stack */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5, ease }}
          className="hero-cards relative z-10 mt-[clamp(40px,4vw,80px)] flex h-[760px] justify-center overflow-hidden"
        >
          <div className="relative h-[600px] w-[740px] shrink-0 origin-[50%_30%] scale-[1.25]">
            {backCards.map((c) => (
              <div key={c.x} className="hero-card hero-card-back" style={{ left: c.x, top: c.y }} />
            ))}
            <div className="hero-card hero-card-front">
              <div className="absolute inset-0 bg-[linear-gradient(196deg,transparent_0%,transparent_40%,rgba(3,3,12,0.55)_58%,rgba(3,3,10,0.92)_78%,#030308_100%)]" />
              <Image
                src="/icon-512.png"
                alt="Noctrum"
                width={360}
                height={360}
                quality={95}
                className="absolute left-[46px] top-1/2 h-[180px] w-[180px] -translate-y-1/2 drop-shadow-[-14px_18px_22px_rgba(6,6,34,0.7)]"
              />
            </div>
            <div className="hero-cards-shade" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
