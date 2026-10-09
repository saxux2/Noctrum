import Image from "next/image";
import Reveal from "./Reveal";

function ChainlinkMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5L12 2.5Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

const stack: { name: string; icon: React.ReactNode }[] = [
  { name: "Chainlink CRE", icon: <ChainlinkMark /> },
  { name: "Monad", icon: <Image src="/chains/monad.png" alt="" width={56} height={56} quality={95} className="h-7 w-7 rounded-full" /> },
  { name: "Arbitrum", icon: <Image src="/chains/arbitrum.png" alt="" width={56} height={56} quality={95} className="h-7 w-7 rounded-full" /> },
  { name: "Wormhole", icon: <Image src="/wormhole.png" alt="" width={56} height={56} quality={95} className="h-7 w-7 rounded-full" /> },
  { name: "Ethereum", icon: <Image src="/chains/ethereum.png" alt="" width={56} height={56} quality={95} className="h-7 w-7 rounded-full" /> },
];

export default function BuiltWith() {
  return (
    <section className="relative px-5 pb-10 pt-4 sm:pb-16">
      <Reveal className="mx-auto max-w-6xl text-center">
        <p className="text-[13px] text-white/60">Built with</p>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 sm:gap-x-16">
          {stack.map((s) => (
            <li key={s.name} className="flex items-center gap-2.5 text-white/55 grayscale transition hover:text-white/90 hover:grayscale-0">
              {s.icon}
              <span className="text-[19px] font-medium tracking-tight">{s.name}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
