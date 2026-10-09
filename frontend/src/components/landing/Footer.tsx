import Image from "next/image";
import { links } from "@/constants/links";

const cols = [
  [
    { label: "Start lending", href: links.lend },
    { label: "Start borrowing", href: links.borrow },
    { label: "Explore markets", href: links.explore },
    { label: "Careers", href: links.careers },
  ],
  [
    { label: "Docs", href: links.docs },
    { label: "Litepaper", href: links.litepaper },
    { label: "Research", href: links.research },
    { label: "Privacy model", href: links.privacyModel },
  ],
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink-2 px-5 pt-28 sm:pt-40">
      <div className="mx-auto flex max-w-[1140px] flex-col-reverse gap-12 md:flex-row md:justify-between">
        <div className="flex gap-16 sm:gap-24">
          {cols.map((col, i) => (
            <ul key={i} className="space-y-3">
              {col.map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-[15px] text-white/65 transition-colors hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2.5">
            <Image src="/icon-512.png" alt="" width={56} height={56} quality={95} className="h-7 w-7" />
            <span className="text-[17px] font-semibold tracking-[0.16em] text-white">NOCTRUM</span>
          </div>
          <p className="mt-3 max-w-[18ch] text-[20px] leading-snug text-white sm:text-[22px]">Private Lending, Priced by Sealed Bids</p>
        </div>
      </div>

      {/* giant wordmark, vector so it stays sharp at any size */}
      <div className="relative mx-auto mt-16 max-w-[1140px] sm:mt-24">
        <svg viewBox="0 0 1000 170" className="block h-auto w-full translate-y-[18%]" role="img" aria-label="Noctrum">
          <defs>
            <linearGradient id="wm-x" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#17171c" />
              <stop offset="0.3" stopColor="#2a2a6a" />
              <stop offset="0.52" stopColor="#6366f1" />
              <stop offset="0.72" stopColor="#2a2a6a" />
              <stop offset="1" stopColor="#17171c" />
            </linearGradient>
            <linearGradient id="wm-y" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
            </linearGradient>
            <mask id="wm-fade">
              <rect width="1000" height="170" fill="url(#wm-y)" />
            </mask>
          </defs>
          <text
            x="500"
            y="160"
            textAnchor="middle"
            textLength="990"
            lengthAdjust="spacingAndGlyphs"
            fontSize="200"
            fontWeight="600"
            fill="url(#wm-x)"
            stroke="rgba(160,160,255,0.18)"
            strokeWidth="1"
            mask="url(#wm-fade)"
            style={{ fontFamily: "var(--font-sans)", letterSpacing: "-0.02em" }}
          >
            NOCTRUM
          </text>
        </svg>
      </div>
    </footer>
  );
}
