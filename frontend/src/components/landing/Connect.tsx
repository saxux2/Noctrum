import { ArrowUpRight } from "lucide-react";
import { links } from "@/constants/links";
import GlassStack from "./GlassStack";
import Reveal from "./Reveal";

function Door({
  title,
  cta,
  href,
  primary,
  coin,
}: {
  title: string;
  cta: string;
  href: string;
  primary?: boolean;
  coin: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] bg-[linear-gradient(180deg,#0e0e18_0%,#0a0a14_55%,#141350_100%)]">
      <div className="relative z-10 flex flex-col items-center px-6 pt-12 text-center">
        <h3 className="display text-[30px] font-light text-white sm:text-[34px]">{title}</h3>
        <a href={href} target="_blank" rel="noopener noreferrer" className={`mt-6 ${primary ? "btn-primary" : "btn-ghost"}`}>
          {cta} {primary && <ArrowUpRight className="h-4 w-4" />}
        </a>
      </div>
      <div className="pointer-events-none relative mt-6 h-[300px] overflow-hidden sm:h-[340px]">
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_60%_100%_at_50%_100%,rgba(99,102,241,0.45),transparent)]" />
        <div className="absolute left-1/2 top-6 origin-top -translate-x-1/2 scale-[0.8] sm:scale-100">
          <GlassStack src={coin} count={3} gap={22} width={380} height={340} rotateX={22} rotateY={-14} imageSize={190} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-[14px] ring-1 ring-inset ring-[#6366f1]/30" />
    </div>
  );
}

export default function Connect() {
  return (
    <section className="relative bg-ink-2 px-5 pt-28 sm:pt-40">
      <Reveal className="mx-auto max-w-4xl text-center">
        <h2 className="display text-[32px] font-light text-white sm:text-[48px] lg:text-[56px]">
          Where Lenders and Borrowers <br className="hidden sm:block" />
          Meet in Private
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-base">
          From your first sealed bid to Platinum-tier borrowing, Noctrum clears the market without exposing a single rate.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-14 grid max-w-[1140px] gap-4 sm:mt-16 md:grid-cols-2">
        <Door title="Lenders" cta="Start Lending" href={links.lend} primary coin="/nusd.png" />
        <Door title="Borrowers" cta="Start Borrowing" href={links.borrow} coin="/neth.png" />
      </Reveal>
    </section>
  );
}
