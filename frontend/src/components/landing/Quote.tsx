import Image from "next/image";
import { links } from "@/constants/links";
import Reveal from "./Reveal";

export default function Quote() {
  return (
    <section className="relative px-5 py-24 sm:py-36">
      <Reveal className="mx-auto max-w-[760px]">
        <blockquote className="text-[22px] leading-[1.45] tracking-[-0.01em] text-white sm:text-[30px]">
          <span aria-hidden className="mr-1 align-[-0.05em] font-serif text-[1.15em] font-bold">&ldquo;</span>
          From sealed bid to settled loan, your rate stays encrypted until the confidential runtime opens it. This is fair price
          discovery, enforced by cryptography and not promised by us.
        </blockquote>
        <a href={links.litepaper} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex items-center gap-3 text-[15px] text-white/60 hover:text-white/90">
          <Image src="/icon-512.png" alt="" width={64} height={64} quality={95} className="h-8 w-8" />
          The Noctrum Litepaper
        </a>
      </Reveal>
    </section>
  );
}
