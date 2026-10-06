"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {

    title: "Private Rate Discovery",
    desc: "Lenders submit encrypted rates that only Chainlink CRE can decrypt. No front-running, no manipulation.",
    thumbnail: "/thumbnail1.png",
    visualBg: "bg-[#161616]",
    hoverBg: "group-hover:bg-[#e2a9f1]",
    link: "https://docs.ghost-finance.xyz/protocol/privacy-model"
  },
  {

    title: "Fair Yield For Every Lender",
    desc: "Each lender earns their own bid rate — no uniform clearing price. You set your rate, you earn your rate.",
    thumbnail: "/thumbnail2.png",
    visualBg: "bg-[#161616]",
    hoverBg: "group-hover:bg-[#f5c882]",
    link: "https://docs.ghost-finance.xyz/protocol/trust-model"
  },
  {

    title: "CRE-Powered Settlement",
    desc: "Matching, validation, and fund disbursement happen inside Chainlink's confidential runtime. Trustless and atomic.",
    thumbnail: "/thumbnail3.png",
    visualBg: "bg-[#161616]",
    hoverBg: "group-hover:bg-[#a5b4fc]",
    link: "https://docs.ghost-finance.xyz/cre-workflows/overview"
  },
  {

    title: "On-Chain Credit Tiers",
    desc: "Build reputation from Bronze to Platinum. Higher tiers mean lower collateral.",
    thumbnail: "/thumbnail4.png",
    visualBg: "bg-[#161616]",
    hoverBg: "group-hover:bg-[#c4b5fd]",
    link: "https://docs.ghost-finance.xyz/incentives/credit-tiers"
  },
];

export default function Features() {
  return (
    <section className="pt-12 pb-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl sm:text-[40px] font-semibold tracking-tight leading-tight mb-3 text-white"
        >
          How Ghost works.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-gray-400 mb-14 max-w-lg text-sm leading-relaxed"
        >
          Sealed-bid auctions, confidential compute matching, and private transfers — built on Chainlink.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.a
              key={f.title}
              href={f.link}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              className="rounded-[20px] bg-[#161616] border border-white/[0.06] hover:border-white/[0.1] transition-all hover-lift group cursor-pointer overflow-hidden flex flex-col"
            >
              {/* Visual area */}
              <div className={`relative aspect-[4/3] ${f.visualBg} overflow-hidden p-5`}>
                {/* Bordered thumbnail container */}
                <div className={`w-full h-full rounded-2xl border border-white/[0.08] overflow-hidden flex items-center justify-center bg-[#161616] ${f.hoverBg} transition-colors duration-300`}>
                  <img
                    src={f.thumbnail}
                    alt={f.title}
                    className="h-full object-contain transition-transform duration-300 group-hover:scale-[1.2]"
                  />
                </div>
              </div>
              {/* Text area */}
              <div className="p-6 pt-5 pb-7">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                  <ArrowUpRight className="w-5.5 h-5.5 text-gray-500 group-hover:text-white transition-colors shrink-0" />
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
