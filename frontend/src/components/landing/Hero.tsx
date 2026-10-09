"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import { useRef } from "react";
import { links } from "@/constants/links";
import GlassStack from "./GlassStack";
import MetalCoin, { type CoinGlyph } from "./MetalCoin";

const coins: { glyph: CoinGlyph; label: string }[] = [
  { glyph: "nusd", label: "nUSD" },
  { glyph: "monad", label: "Monad" },
  { glyph: "noctrum", label: "Noctrum" },
  { glyph: "chainlink", label: "Chainlink" },
  { glyph: "ethereum", label: "Ethereum" },
];

// Proportions measured from the design reference and scaled with viewport width.
const COIN = "clamp(60px, 6.5vw, 138px)";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const stackY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const stackRotate = useTransform(scrollYProgress, [0, 1], [0, 8]);

  return (
    <section id="top" ref={ref} className="relative overflow-hidden pt-[clamp(132px,19.4vw,400px)]">
      {/* copy */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-5 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }} className="hero-badge">
          <Check className="h-[1em] w-[1em] text-[#8b93ff]" strokeWidth={2.5} />
          <span>
            <span className="text-[#8b93ff]">Sealed bids</span> settled in Chainlink CRE
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease }}
          className="mx-auto mt-[clamp(20px,1.9vw,42px)] text-[clamp(38px,4.65vw,98px)] font-normal leading-[1.24] tracking-[-0.012em] text-white"
        >
          The Private Lending Market <br className="hidden sm:block" />
          for Onchain Capital.
        </motion.h1>
      </div>

      {/* horizon + coins */}
      <div className="relative mt-[clamp(28px,4.2vw,90px)]">
        <div className="relative">
          <div className="horizon-glow" />
          {/* the planet: its rim crosses the coins at their lower third */}
          <div className="pointer-events-none absolute inset-x-0 top-[78%] h-[1400px]">
            <div className="horizon" />
          </div>
          <div className="relative z-10 flex justify-center">
            <div className="flex" style={{ gap: `calc(${COIN} * -0.2)` }}>
              {coins.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 30, rotate: -20 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ duration: 0.9, delay: 0.25 + i * 0.08, ease }}
                  style={{ zIndex: i + 1 }}
                >
                  <MetalCoin glyph={c.glyph} label={c.label} size={COIN} />
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
          className="relative z-10 mt-[clamp(36px,5.8vw,122px)] flex flex-wrap items-center justify-center gap-[clamp(12px,1.4vw,28px)] px-5"
        >
          <a href={links.app} target="_blank" rel="noopener noreferrer" className="btn-primary btn-lg">
            Launch App <ArrowUpRight className="h-[1em] w-[1em]" />
          </a>
          <a href={links.litepaper} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-lg">
            Read Litepaper
          </a>
        </motion.div>

        {/* glass stack */}
        <motion.div style={{ y: stackY, rotateZ: stackRotate }} className="relative z-10 mt-10 sm:mt-16">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.5, ease }}
            className="fade-bottom flex justify-center pb-10 [--s:0.46] sm:[--s:0.8] lg:[--s:1]"
          >
            <div className="h-[calc(520px*var(--s))] w-full" style={{ transform: "scale(var(--s))", transformOrigin: "top center" }}>
              <GlassStack src="/icon-512.png" count={16} gap={30} width={400} height={460} rotateY={-50} rotateX={-8} imageSize={220} className="pt-2" style={{ transform: "translateX(-190px)" }} />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
