import Image from "next/image";
import { BookOpen, Command, LayoutDashboard, Send } from "lucide-react";
import Reveal from "./Reveal";

type Item = {
  chip: string;
  title: string;
  body: string;
  art: React.ReactNode;
  featured?: boolean;
};

const iconArt = (Icon: typeof Send, bg: string) => (
  <div className="absolute inset-0" style={{ background: bg }}>
    <Icon className="absolute left-1/2 top-[30%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 text-white/[0.09]" strokeWidth={1} />
  </div>
);

const imageArt = (src: string, bg: string, size = 220) => (
  <div className="absolute inset-0" style={{ background: bg }}>
    <Image
      src={src}
      alt=""
      width={size * 2}
      height={size * 2}
      quality={95}
      className="absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
      style={{ width: size, height: size }}
    />
  </div>
);

const items: Item[] = [
  {
    chip: "Web App",
    title: "Lend, borrow and swap in one dashboard",
    body: "Sign in with Privy, deposit into shielded balances, post sealed bids and track every loan from one place.",
    art: imageArt("/icon-512.png", "radial-gradient(ellipse at 50% 20%, #23308f 0%, #0d0f2c 55%, #07070f 100%)", 180),
  },
  {
    chip: "Confidential compute",
    title: "Settled inside Chainlink CRE",
    body: "Three workflows run in a trusted execution environment: matching every 30 s, transfers every 15 s and health checks every 60 s.",
    art: (
      <div className="absolute inset-0">
        <Image src="/bgimg.jpg" alt="" fill sizes="(min-width:640px) 760px, 640px" quality={95} className="object-cover object-[50%_35%] opacity-90" />
      </div>
    ),
    featured: true,
  },
  {
    chip: "Chain",
    title: "Live on Monad Testnet",
    body: "The Noctrum vault, nUSD, nETH and the swap pool are deployed on Monad, chain 10143, for fast and cheap settlement.",
    art: imageArt("/chains/monad.png", "radial-gradient(ellipse at 50% 20%, #3b2a8c 0%, #120d33 55%, #07070f 100%)", 170),
  },
  {
    chip: "Telegram",
    title: "Lend from a chat",
    body: "The Noctrum bot connects your wallet through WalletConnect and gives you balances, intents and loans in Telegram.",
    art: iconArt(Send, "radial-gradient(ellipse at 50% 20%, #164c7a 0%, #0b1a2e 55%, #07070f 100%)"),
  },
  {
    chip: "Bridge",
    title: "Bring liquidity with Wormhole",
    body: "Move assets in from other chains with the Wormhole bridge built into the app, then lend them privately.",
    art: imageArt("/wormhole.png", "radial-gradient(ellipse at 50% 20%, #3a2f7a 0%, #141133 55%, #07070f 100%)", 170),
  },
  {
    chip: "Raycast",
    title: "Your market, one keystroke away",
    body: "A Raycast extension for wallet, balances, lending, borrowing and loans, without leaving your desktop.",
    art: iconArt(Command, "radial-gradient(ellipse at 50% 20%, #6b1f3a 0%, #22101a 55%, #07070f 100%)"),
  },
  {
    chip: "Open docs",
    title: "Read every rule",
    body: "The litepaper, the matching engine, the privacy model and the API are all documented in the open.",
    art: iconArt(BookOpen, "radial-gradient(ellipse at 50% 20%, #2b3b4f 0%, #10151d 55%, #07070f 100%)"),
  },
  {
    chip: "Dashboard",
    title: "Explore every market",
    body: "Browse live markets, credit tiers and your positions, with rates that stay sealed until they are matched.",
    art: iconArt(LayoutDashboard, "radial-gradient(ellipse at 50% 20%, #1f4a3d 0%, #0d1a16 55%, #07070f 100%)"),
  },
];

function Card({ it }: { it: Item }) {
  return (
    <div tabIndex={0} className="group relative h-[400px] w-[290px] shrink-0 overflow-hidden rounded-[10px] bg-panel outline-none focus-visible:ring-2 focus-visible:ring-[#818cf8] sm:h-[460px] sm:w-[340px]">
      {it.art}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/80" />

      {/* default: chip + title */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-12 text-center transition-opacity duration-500 group-hover:opacity-0 group-focus:opacity-0 ${it.featured ? "opacity-0" : ""}`}>
        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] text-white/85 backdrop-blur">{it.chip}</span>
        <p className="mt-4 text-[20px] leading-snug text-white sm:text-[22px]">{it.title}</p>
      </div>

      {/* hover: purple panel with detail */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_90%_70%_at_50%_100%,#8f8cf5_0%,#4e48d4_45%,#2a2580_100%)] px-7 text-center transition-opacity duration-500 group-hover:opacity-100 group-focus:opacity-100 ${it.featured ? "opacity-[0.88]" : "opacity-0"}`}>
        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] text-white/85">{it.chip}</span>
        <p className="mt-4 text-[20px] leading-snug text-white sm:text-[22px]">{it.title}</p>
        <p className="mt-5 text-[14.5px] leading-relaxed text-white/80">{it.body}</p>
      </div>
    </div>
  );
}

export default function Ecosystem() {
  return (
    <section className="relative bg-ink-2 pt-28 sm:pt-40">
      <Reveal className="px-5 text-center">
        <h2 className="display text-[32px] font-light text-white sm:text-[48px] lg:text-[56px]">Embedded in the Ecosystem</h2>
        <p className="mx-auto mt-5 max-w-lg text-[15px] text-white/55">Hover or tap a card to see how each piece fits.</p>
      </Reveal>

      <div className="relative mt-14 overflow-hidden sm:mt-16">
        <div className="rail flex w-max gap-4">
          {[...items, ...items].map((it, i) => (
            <div key={i} aria-hidden={i >= items.length}>
              <Card it={it} />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--color-ink-2)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[var(--color-ink-2)] to-transparent" />
      </div>
    </section>
  );
}
