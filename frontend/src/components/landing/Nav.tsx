"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { links } from "@/constants/links";

// --- Data (same menu model as the Ghost marketing site) ---

type MenuItem = { name: string; desc: string; colors: [string, string, string]; link: string };
type Group = { category?: string; items: MenuItem[] };

const menus = {
  Products: [
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
        { name: "Raycast Extension", desc: "Use Noctrum's confidential matching engine from Raycast.", colors: ["#67e8f9", "#0891b2", "#a5f3fc"], link: links.raycast },
        { name: "Telegram Bot", desc: "Access all of Noctrum's features via Telegram.", colors: ["#86efac", "#16a34a", "#bbf7d0"], link: links.telegram },
      ],
    },
    {
      category: "Institutions & Projects",
      items: [
        { name: "Private Pools", desc: "Institutional-grade private lending pools with custom parameters.", colors: ["#f0abfc", "#a855f7", "#e9d5ff"], link: links.explore },
      ],
    },
  ],
  Resources: [
    {
      items: [
        { name: "Blog", desc: "Protocol updates and research insights.", colors: ["#fbbf24", "#d97706", "#fde68a"], link: links.blog },
        { name: "Documentation", desc: "Protocol architecture & integration guides.", colors: ["#a78bfa", "#7c3aed", "#c4b5fd"], link: links.docs },
        { name: "Litepaper", desc: "Read the Noctrum protocol litepaper.", colors: ["#f472b6", "#db2777", "#fbcfe8"], link: links.litepaper },
      ],
    },
  ],
  Tokens: [
    {
      items: [
        { name: "$nUSD", desc: "Privacy-preserving stablecoin for lending and borrowing.", colors: ["#34d399", "#059669", "#a7f3d0"], link: links.tokenomics },
        { name: "$nETH", desc: "Shielded ETH for collateral and private transfers.", colors: ["#60a5fa", "#2563eb", "#bfdbfe"], link: links.tokenomics },
      ],
    },
  ],
} satisfies Record<string, Group[]>;

type Tab = keyof typeof menus;
const tabs = Object.keys(menus) as Tab[];
const flat = (tab: Tab) => menus[tab].flatMap((g) => g.items);

const springBouncy = { type: "spring" as const, stiffness: 350, damping: 20, mass: 0.7 };
const springSnappy = { type: "spring" as const, stiffness: 400, damping: 28 };

const linkProps = (href: string) =>
  href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};

// --- Abstract visual on the right of the dropdown ---

function PanelVisual({ colors }: { colors: [string, string, string] }) {
  return (
    <motion.div
      className="relative h-full w-full overflow-hidden rounded-2xl"
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

// --- Dropdown ---

function DropdownItem({ item, tab, active, onHover }: { item: MenuItem; tab: Tab; active: boolean; onHover: () => void }) {
  return (
    <a href={item.link} {...linkProps(item.link)} onMouseEnter={onHover} onFocus={onHover} className="group relative flex items-center justify-between rounded-xl px-4 py-3">
      {active && <motion.div layoutId={`nav-highlight-${tab}`} className="absolute inset-0 rounded-xl bg-white/[0.06]" transition={springSnappy} />}
      <div className="relative z-10 min-w-0">
        <span className="text-[14px] font-bold text-white">{item.name}</span>
        <p className="mt-0.5 text-[12.5px] leading-snug text-white/45">{item.desc}</p>
      </div>
      <ArrowUpRight className="relative z-10 ml-3 h-3.5 w-3.5 shrink-0 text-white/35" />
    </a>
  );
}

function Dropdown({ tab, hovered, setHovered }: { tab: Tab; hovered: number; setHovered: (i: number) => void }) {
  const items = flat(tab);
  const colors = items[hovered]?.colors ?? items[0].colors;
  let idx = -1;

  return (
    <motion.div
      key={tab}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      className="flex overflow-hidden rounded-2xl border border-white/10 bg-[#141418] shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]"
      style={{ width: items.length > 3 ? 580 : 520 }}
    >
      <LayoutGroup id={tab}>
        <div className="min-w-0 flex-1 px-2 py-3">
          {menus[tab].map((g: Group, gi) => (
            <div key={g.category ?? gi}>
              {gi > 0 && <div className="mx-3 my-2 h-px bg-white/[0.06]" />}
              {g.category && <p className="mb-1 mt-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-white/40">{g.category}</p>}
              {g.items.map((item) => {
                idx += 1;
                const i = idx;
                return <DropdownItem key={item.name} item={item} tab={tab} active={hovered === i} onHover={() => setHovered(i)} />;
              })}
            </div>
          ))}
        </div>
      </LayoutGroup>
      <div className="w-[210px] shrink-0 p-3">
        <AnimatePresence mode="wait">
          <PanelVisual key={`${tab}-${hovered}`} colors={colors} />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Navbar ---

export default function Nav() {
  const [active, setActive] = useState<Tab | null>(null);
  // The last opened tab, kept so the panel still has content while it fades out.
  const [shown, setShown] = useState<Tab | null>(null);
  const [hovered, setHovered] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<Tab | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const open = useCallback(
    (tab: Tab) => {
      cancelClose();
      setShown(tab);
      setActive((prev) => {
        if (prev !== tab) setHovered(0);
        return tab;
      });
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setActive(null), 200);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-[34px]">
      <nav
        onKeyDown={(e) => e.key === "Escape" && setActive(null)}
        className={`mx-auto flex h-[64px] max-w-[1360px] items-center justify-between rounded-full border pl-3 pr-3 transition-colors duration-300 sm:h-[76px] sm:pl-4 sm:pr-8 ${
          scrolled ? "border-white/10 bg-[#06060b]/85 backdrop-blur-xl" : "border-white/[0.08] bg-[#06060b]/55 backdrop-blur-md"
        } shadow-[0_0_40px_-10px_rgba(99,102,241,0.25)]`}
      >
        <a href="#top" aria-label="Noctrum home" className="flex items-center">
          <Image src="/icon-512.png" alt="Noctrum" width={96} height={96} quality={95} priority className="h-11 w-11 sm:h-[46px] sm:w-[46px]" />
        </a>

        {/* desktop */}
        <div className="relative hidden items-center md:flex">
          <div className="flex items-center gap-1 lg:gap-3" onMouseLeave={scheduleClose}>
            <a href="#top" onMouseEnter={() => setActive(null)} className="px-3 py-2 text-[17px] text-white">
              Home
            </a>
            {tabs.map((tab) => (
              <button
                key={tab}
                onMouseEnter={() => open(tab)}
                onFocus={() => open(tab)}
                onClick={() => (active === tab ? setActive(null) : open(tab))}
                aria-expanded={active === tab}
                aria-haspopup="true"
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-[17px] transition-colors duration-150 ${
                  active === tab ? "text-white" : "text-white/75 hover:text-white"
                }`}
              >
                {active === tab && <motion.div layoutId="tab-pill" className="absolute inset-0 rounded-full bg-white/10" transition={springSnappy} />}
                <span className="relative z-10">{tab}</span>
                <ChevronDown className={`relative z-10 h-3.5 w-3.5 transition-transform duration-200 ${active === tab ? "rotate-180" : ""}`} />
              </button>
            ))}
            <a
              href={links.careers}
              {...linkProps(links.careers)}
              onMouseEnter={() => {
                cancelClose();
                setActive(null);
              }}
              className="px-3 py-2 text-[17px] text-white/75 transition-colors hover:text-white"
            >
              Careers
            </a>
          </div>

          {/* Always mounted and faded with `animate`, not AnimatePresence: the sliding layoutId
              highlight inside stalls a presence exit, leaving an invisible panel over the hero. */}
          <motion.div
            initial={false}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            onAnimationComplete={() => !active && setShown(null)}
            className={`absolute right-0 top-full z-50 pt-6 ${active ? "" : "pointer-events-none"}`}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            aria-hidden={!active}
          >
            {shown && <Dropdown key={shown} tab={shown} hovered={hovered} setHovered={setHovered} />}
          </motion.div>
        </div>

        {/* mobile toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-full p-2 text-white/80 md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-h-[calc(100dvh-100px)] max-w-[1360px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0a10]/95 p-3 backdrop-blur-xl md:hidden"
          >
            {tabs.map((tab) => (
              <div key={tab}>
                <button
                  onClick={() => setMobileTab((t) => (t === tab ? null : tab))}
                  aria-expanded={mobileTab === tab}
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[15px] text-white/85 hover:bg-white/5"
                >
                  {tab}
                  <ChevronDown className={`h-4 w-4 transition-transform ${mobileTab === tab ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {mobileTab === tab && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      {flat(tab).map((it) => (
                        <a key={it.name} href={it.link} {...linkProps(it.link)} onClick={() => setMobileOpen(false)} className="flex items-start gap-3 rounded-2xl px-4 py-2.5 hover:bg-white/5">
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.colors[0] }} />
                          <span>
                            <span className="block text-[14px] font-bold text-white">{it.name}</span>
                            <span className="block text-[12.5px] text-white/45">{it.desc}</span>
                          </span>
                        </a>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            <a href={links.careers} {...linkProps(links.careers)} className="block rounded-2xl px-4 py-3 text-[15px] text-white/85 hover:bg-white/5">
              Careers
            </a>
            <a href={links.app} {...linkProps(links.app)} className="btn-primary mt-2 w-full justify-center">
              Launch App
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
