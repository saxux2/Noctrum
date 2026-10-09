import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { links } from "@/constants/links";
import Reveal from "./Reveal";

function Stat({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  return (
    <div className={`panel flex flex-col justify-between p-6 sm:p-8 ${className}`}>
      <p className="display text-[44px] font-light text-white sm:text-[56px] lg:text-[64px]">{value}</p>
      <p className="mt-10 text-[15px] text-white/80">{label}</p>
    </div>
  );
}

export default function Stats() {
  return (
    <section className="relative px-5 pt-20 sm:pt-28">
      <Reveal className="mx-auto max-w-4xl text-center">
        <h2 className="display text-[32px] font-light text-white sm:text-[48px] lg:text-[56px]">
          Fair Yield. Enforced by Code.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-base">
          Every number below is a protocol rule, run inside Chainlink&apos;s confidential runtime. None of them is a promise.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-14 grid max-w-[1140px] gap-4 sm:mt-16 md:grid-cols-3">
        <div className="grid gap-4">
          <Stat value="30 sec" label="Matching epoch for every sealed bid" className="min-h-[260px] md:min-h-[300px]" />
          <Stat value="1.2×" label="Lowest collateral, at Platinum tier" className="min-h-[260px] md:min-h-[300px]" />
        </div>
        <div className="grid gap-4 md:grid-rows-[1.6fr_1fr]">
          <Stat value="5%" label="Collateral forfeited when a borrower rejects a match" />
          <Stat value="4 tiers" label="Bronze to Platinum credit, earned by repaying" className="min-h-[200px]" />
        </div>

        <div className="relative min-h-[420px] overflow-hidden rounded-[10px] bg-[linear-gradient(165deg,#6b6ff5_0%,#4c45d8_42%,#2c2490_100%)] p-6 sm:p-8 md:min-h-0">
          <p className="display text-[44px] font-light text-white sm:text-[56px] lg:text-[64px]">0</p>
          <p className="mt-3 max-w-[14ch] text-[15px] leading-snug text-white/85">Plaintext rates ever stored on our server</p>

          <div className="pointer-events-none absolute -bottom-10 -right-16 h-[380px] w-[380px]">
            <Image
              src="/nusd.png"
              alt=""
              width={520}
              height={520}
              quality={95}
              sizes="260px"
              className="absolute right-6 top-0 h-[200px] w-[200px] rotate-[18deg] drop-shadow-[0_24px_30px_rgba(10,8,50,0.6)]"
            />
            <Image
              src="/neth.png"
              alt=""
              width={560}
              height={560}
              quality={95}
              sizes="280px"
              className="absolute bottom-10 left-0 h-[230px] w-[230px] -rotate-[14deg] drop-shadow-[0_30px_40px_rgba(10,8,50,0.7)]"
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.15} className="mt-12 flex justify-center">
        <a href={links.lend} target="_blank" rel="noopener noreferrer" className="btn-primary">
          Start Lending <ArrowUpRight className="h-4 w-4" />
        </a>
      </Reveal>
    </section>
  );
}
