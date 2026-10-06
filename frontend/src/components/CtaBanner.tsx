"use client";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function CtaBanner() {
  return (
    <section className="py-24 px-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="max-w-6xl mx-auto flex flex-col lg:flex-row items-start justify-between gap-12"
      >
        <h2 className="text-4xl sm:text-5xl lg:text-[56px] font-semibold tracking-tight leading-[1.1] text-[#00000] max-w-xl">
          Lending where rates are discovered, not imposed
        </h2>
        <div className="max-w-md">
          <p className="text-gray-300 leading-relaxed mb-8 text-base">
            Ghost replaces algorithmic rate curves with sealed-bid auctions settled inside Chainlink&apos;s confidential compute. Fair markets, private by default.
          </p>
          <button className="inline-flex items-center gap-2.5 px-7 py-3.5 text-gray-900 text-sm font-semibold rounded-full hover:opacity-90 transition-all" style={{ backgroundColor: "#e2a9f1" }}>
            Read the litepaper
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}
