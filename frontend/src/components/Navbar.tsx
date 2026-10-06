"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronDown, ArrowUpRight, Menu, X } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { links } from "@/constants/links";

// --- Data ---

const products = [
  {
    category: "Individuals",
    items: [
      { name: "Lend", desc: "Deposit at your own sealed rate. Earn discriminatory yield.", colors: ["#a78bfa", "#7c3aed", "#c4b5fd"], link: links.lend },
      { name: "Borrow", desc: "Post collateral, set your max rate, get matched to cheapest lenders.", colors: ["#818cf8", "#4f46e5", "#a5b4fc"], link: links.borrow },
    ],
  },
  {
    category: "Tools",
    items: [
      { name: "Raycast Extension", desc: "Use Ghost's confidential matching engine from Raycast.", colors: ["#67e8f9", "#0891b2", "#a5f3fc"], link: links.raycast },
      { name: "Telegram Bot", desc: "Access all of Ghost's features via Telegram.", colors: ["#86efac", "#16a34a", "#bbf7d0"], link: links.telegram },
    ],
  },
  {
    category: "Institutions & Projects",
    items: [
      { name: "Private Pools", desc: "Institutional-grade private lending pools with custom parameters.", colors: ["#f0abfc", "#a855f7", "#e9d5ff"], link: "https://app.ghost-finance.xyz/explore" },
    ],
  },
];

const resources = [
  { name: "Blog", desc: "Protocol updates and research insights.", colors: ["#fbbf24", "#d97706", "#fde68a"], link: links.blog },
  { name: "Documentation", desc: "Protocol architecture & integration guides.", colors: ["#a78bfa", "#7c3aed", "#c4b5fd"], link: links.docs },
  { name: "Litepaper", desc: "Read the Ghost protocol litepaper.", colors: ["#f472b6", "#db2777", "#fbcfe8"], link: links.litepaper },
];

const tokens = [
  { name: "$gUSD", desc: "Privacy-preserving stablecoin for lending and borrowing.", colors: ["#34d399", "#059669", "#a7f3d0"], link: links.tokenomics },
  { name: "$gETH", desc: "Shielded ETH for collateral and private transfers.", colors: ["#60a5fa", "#2563eb", "#bfdbfe"], link: links.tokenomics },
];

type MenuItem = { name: string; desc: string; badge?: string; colors: string[]; link: string };

const tabs = ["Products", "Resources", "Tokens"] as const;
type Tab = (typeof tabs)[number];

function getItems(tab: Tab): MenuItem[] {
  switch (tab) {
    case "Products": return products.flatMap((g) => g.items);
    case "Resources": return resources;
    case "Tokens": return tokens;
  }
}

// --- Spring configs ---

const springBouncy = { type: "spring" as const, stiffness: 350, damping: 20, mass: 0.7 };
const springSnappy = { type: "spring" as const, stiffness: 400, damping: 28 };

// --- Abstract visual ---

function PanelVisual({ colors }: { colors: string[] }) {
  return (
    <motion.div
      className="w-full h-full rounded-2xl overflow-hidden relative"
      style={{ background: colors[0] }}
      initial={{ opacity: 0, scale: 0.88, rotate: -3 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.88, rotate: 3 }}
      transition={springBouncy}
    >
      <motion.div
        className="absolute rounded-full"
        style={{ width: "70%", height: "70%", background: colors[1], right: "-10%", bottom: "-10%" }}
        initial={{ scale: 0.5, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 0.7, y: 0 }}
        transition={{ ...springBouncy, delay: 0.04 }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ width: "45%", height: "45%", background: colors[2], right: "5%", bottom: "5%" }}
        initial={{ scale: 0.3, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 0.6, y: 0 }}
        transition={{ ...springBouncy, delay: 0.08 }}
      />
      <motion.div
        className="absolute"
        style={{ width: "40%", height: "100%", background: `linear-gradient(180deg, ${colors[1]}88, ${colors[2]}44)`, left: "30%", top: 0 }}
        initial={{ opacity: 0, x: -30, scaleY: 0.8 }}
        animate={{ opacity: 0.5, x: 0, scaleY: 1 }}
        transition={{ ...springSnappy, delay: 0.06 }}
      />
    </motion.div>
  );
}

// --- Nav item ---

function NavItem({
  item,
  layoutScope,
  isHovered,
  onHover,
}: {
  item: MenuItem;
  layoutScope: string;
  isHovered: boolean;
  onHover: () => void;
}) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex items-center justify-between px-4 py-3 rounded-xl group"
      onMouseEnter={onHover}
    >
      {isHovered && (
        <motion.div
          layoutId={`nav-highlight-${layoutScope}`}
          className="absolute inset-0 bg-white/[0.06] rounded-xl"
          transition={springSnappy}
        />
      )}
      <div className="min-w-0 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{item.name}</span>
          {item.badge && (
            <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-md">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-gray-600 shrink-0 ml-3 relative z-10" />
    </a>
  );
}

// --- Dropdown content ---

function DropdownContent({ tab, hoveredIdx, setHoveredIdx }: { tab: Tab; hoveredIdx: number; setHoveredIdx: (i: number) => void }) {
  const allItems = getItems(tab);
  const activeColors = allItems[hoveredIdx]?.colors ?? allItems[0]?.colors ?? ["#333", "#555", "#777"];

  return (
    <motion.div
      key={tab}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      className="flex rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] border border-white/10 bg-[#1a1a1a] overflow-hidden"
      style={{ width: allItems.length > 3 ? 580 : 520 }}
    >
      {/* left: menu items */}
      <LayoutGroup id={tab}>
        <div className="flex-1 py-4 px-2 min-w-0">
          {tab === "Products"
            ? products.map((group, gi) => {
                const allFlat = getItems("Products");
                return (
                  <div key={group.category}>
                    {gi > 0 && <div className="h-px bg-white/5 mx-3 my-2" />}
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 mb-1 mt-1">
                      {group.category}
                    </p>
                    {group.items.map((item) => {
                      const globalIdx = allFlat.findIndex((i) => i.name === item.name);
                      return (
                        <NavItem
                          key={item.name}
                          item={item}
                          layoutScope={tab}
                          isHovered={hoveredIdx === globalIdx}
                          onHover={() => setHoveredIdx(globalIdx)}
                        />
                      );
                    })}
                  </div>
                );
              })
            : allItems.map((item, idx) => (
                <NavItem
                  key={item.name}
                  item={item}
                  layoutScope={tab}
                  isHovered={hoveredIdx === idx}
                  onHover={() => setHoveredIdx(idx)}
                />
              ))}
        </div>
      </LayoutGroup>

      {/* right: animated visual */}
      <div className="w-[220px] p-3 shrink-0">
        <AnimatePresence mode="wait">
          <PanelVisual key={`${tab}-${hoveredIdx}`} colors={activeColors} />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Main Navbar ---

export default function Navbar() {
  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabEnter = useCallback((tab: Tab) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveTab((prev) => {
      if (prev !== tab) setHoveredIdx(0);
      return tab;
    });
  }, []);

  const handleLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setActiveTab(null), 200);
  }, []);

  const handlePanelEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Image src="/ghost-logo1.png" alt="Ghost" width={90} height={36} className="h-9 w-auto" />
        </div>

        {/* Desktop nav — single container for tabs + dropdown */}
        <div className="hidden md:flex flex-col items-center relative">
          <div className="flex items-center gap-0.5" onMouseLeave={handleLeave}>
            {tabs.map((tab) => (
              <button
                key={tab}
                onMouseEnter={() => handleTabEnter(tab)}
                className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors duration-150 ${
                  activeTab === tab
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {activeTab === tab && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 bg-white/10 rounded-full"
                    transition={springSnappy}
                  />
                )}
                <span className="relative z-10">{tab}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 relative z-10 transition-transform duration-200 ${activeTab === tab ? "rotate-180" : ""}`}
                />
              </button>
            ))}
            <a
              href={links.careers}
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); setActiveTab(null); }}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-full transition-colors duration-150"
            >
              Careers
            </a>
          </div>

          {/* Dropdown panel — shared across all tabs */}
          <AnimatePresence>
            {activeTab && (
              <div
                className="absolute top-full pt-3 z-50"
                onMouseEnter={handlePanelEnter}
                onMouseLeave={handleLeave}
              >
                <AnimatePresence mode="wait">
                  <DropdownContent
                    key={activeTab}
                    tab={activeTab}
                    hoveredIdx={hoveredIdx}
                    setHoveredIdx={setHoveredIdx}
                  />
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* CTA */}
        <a href={links.app} target="_blank" rel="noopener noreferrer" className="hidden md:block px-5 py-2 text-gray-900 text-sm font-semibold rounded-full hover:opacity-90 transition-opacity" style={{ backgroundColor: "#e2a9f1" }}>
          Launch App
        </a>

        {/* Mobile toggle */}
        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-400">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-[#1a1a1a] border-t border-white/[0.06] overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <a href="#" className="block text-sm font-medium py-2 text-gray-400">Products</a>
              <a href="#" className="block text-sm font-medium py-2 text-gray-400">Resources</a>
              <a href="#" className="block text-sm font-medium py-2 text-gray-400">Tokens</a>
              <a href={links.careers} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium py-2 text-gray-400">Careers</a>
              <a href={links.app} target="_blank" rel="noopener noreferrer" className="block w-full px-5 py-2.5 text-gray-900 text-sm font-semibold rounded-full text-center" style={{ backgroundColor: "#e2a9f1" }}>Launch App</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
