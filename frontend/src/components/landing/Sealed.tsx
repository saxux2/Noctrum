import Image from "next/image";
import Reveal from "./Reveal";

export default function Sealed() {
  return (
    <section className="relative px-5 pt-16 sm:pt-24">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="display text-balance text-[32px] font-light text-white sm:text-[48px] lg:text-[56px]">
          Rate Discovery on Noctrum isn&apos;t Public. <br className="hidden md:block" />
          It&apos;s Sealed.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/60 sm:text-base">
          Lenders encrypt their rates before they leave the browser. Only the confidential runtime can open them, and nobody else
          ever sees a bid, not even our server.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-12 w-[min(1100px,92%)] sm:mt-16">
        <Image
          src="/landing/sealed-stack.png"
          alt=""
          width={1092}
          height={512}
          quality={95}
          sizes="(min-width: 1200px) 1100px, 92vw"
          className="block h-auto w-full"
        />
      </Reveal>
    </section>
  );
}
