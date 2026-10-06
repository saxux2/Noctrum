"use client";
import { ArrowUpRight, FileText, BookOpen, Send } from "lucide-react";
import { motion } from "framer-motion";
import { links } from "@/constants/links";

export default function FollowAlong() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl sm:text-[40px] font-semibold tracking-tight leading-tight mb-12 text-white"
        >
          Follow along.
        </motion.h2>

        {/* Top row: Blog (wider) + Dev docs (narrower) */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
          <motion.a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="sm:col-span-3 flex flex-col justify-between p-7 rounded-2xl border border-white/[0.08] transition-all hover:border-white/[0.14] min-h-[160px]"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-gray-400" />
              <h4 className="font-semibold text-white text-base">Blog</h4>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mt-auto pt-8">Protocol updates, rate discovery research, and ecosystem news.</p>
          </motion.a>

          <motion.a
            href="https://docs.ghost-finance.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            className="sm:col-span-2 flex flex-col justify-between p-7 rounded-2xl bg-[#161616] border border-white/[0.04] transition-all hover:border-white/[0.1] group min-h-[160px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-5 h-5 text-gray-400" />
                <h4 className="font-semibold text-white text-base">Developer docs</h4>
              </div>
              <ArrowUpRight className="w-4.5 h-4.5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mt-auto pt-8">Integration guides, API reference, and CRE workflow docs.</p>
          </motion.a>
        </div>

        {/* Bottom row: X + Discord + Telegram */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.a
            href="https://x.com/_ghostfi"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col justify-between p-7 rounded-2xl bg-[#161616] border border-white/[0.04] transition-all hover:border-white/[0.1] group min-h-[150px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                {/* <h4 className="font-semibold text-white text-base">X</h4> */}
              </div>
              <ArrowUpRight className="w-4.5 h-4.5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mt-auto pt-8">Follow @ghostfinance for protocol updates and announcements.</p>
          </motion.a>

          <motion.a
            href={links.discord}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col justify-between p-7 rounded-2xl bg-[#161616] border border-white/[0.04] transition-all hover:border-white/[0.1] group min-h-[150px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
                <h4 className="font-semibold text-white text-base">Discord</h4>
              </div>
              <ArrowUpRight className="w-4.5 h-4.5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mt-auto pt-8">Join the community — discuss rate strategies, integrations, and governance.</p>
          </motion.a>

          <motion.a
            href={links.telegram}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col justify-between p-7 rounded-2xl bg-[#161616] border border-white/[0.04] transition-all hover:border-white/[0.1] group min-h-[150px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Send className="w-5 h-5 text-gray-400" />
                <h4 className="font-semibold text-white text-base">Telegram</h4>
              </div>
              <ArrowUpRight className="w-4.5 h-4.5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mt-auto pt-8">Access Ghost directly via our Telegram bot.</p>
          </motion.a>
        </div>
      </div>
    </section>
  );
}
