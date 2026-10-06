"use client";

import { useState } from "react";

export default function Newsletter() {
  const [email, setEmail] = useState("");

  return (
    <section className="py-16 px-6 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Stay updated on Ghost Protocol.</h2>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ghost.xyz" className="flex-1 sm:w-72 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#e2a9f1]/20 focus:border-[#e2a9f1]/40 transition-all" />
          <button className="px-6 py-3 text-gray-900 text-sm font-semibold rounded-xl hover:opacity-90 transition-colors whitespace-nowrap" style={{ backgroundColor: "#e2a9f1" }}>Subscribe</button>
        </div>
      </div>
      <p className="max-w-6xl mx-auto text-xs text-gray-500 mt-4 text-center sm:text-right">
        Emails will be delivered by <span className="underline cursor-pointer text-[#e2a9f1]">cloud@ghost.xyz</span>. Unsubscribe at any time.
      </p>
    </section>
  );
}
