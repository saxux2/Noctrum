"use client";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Announcement() {
  return (
    <section className="py-16 px-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="max-w-6xl mx-auto"
      >
        <a
          href="#"
          className="flex flex-col sm:flex-row items-start sm:items-center gap-8 sm:gap-12 bg-[#161616] border border-white/[0.06] rounded-3xl p-8 sm:px-10 sm:pt-6 sm:pb-10 hover:border-white/[0.1] hover:bg-[#c4b5fd] transition-all duration-300 group cursor-pointer overflow-hidden"
        >
          {/* Left content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className="text-xl sm:text-2xl font-semibold text-white group-hover:text-black transition-colors duration-300 flex items-center gap-2.5 mb-2">
              GHOST: Privacy-Preserving Rate Discovery
              <ArrowUpRight className="w-5 h-5 text-gray-500 group-hover:text-black transition-colors duration-300 shrink-0" />
            </h3>

            {/* Description */}
            <p className="text-sm text-gray-400 group-hover:text-gray-700 leading-relaxed max-w-md transition-colors duration-300">
              Read how sealed-bid discriminatory auctions and confidential compute solve rate manipulation in DeFi lending.
            </p>
          </div>

          {/* Right — purple paper image */}
          <div className="shrink-0 hidden sm:flex items-end pr-4 self-end -mb-10 -ml-36">
            <img
              src="/ghost-purple-paper.png"
              alt="Ghost Purple Paper"
              className="w-80 h-auto rounded-xl transition-transform duration-300 group-hover:scale-[1.12]"
            />
          </div>
        </a>
      </motion.div>
    </section>
  );
}
