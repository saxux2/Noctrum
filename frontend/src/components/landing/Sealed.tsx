"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import Reveal from "./Reveal";

const PLATES = 5;

function Plate({ i, spread }: { i: number; spread: MotionValue<number> }) {
  // Plates fan apart as the section scrolls into view.
  const z = useTransform(spread, (s) => (PLATES - 1 - i) * s);
  return (
    <motion.div className="absolute inset-0" style={{ z, transformStyle: "preserve-3d" }}>
      <div className="plate" />
    </motion.div>
  );
}

export default function Sealed() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const spread = useTransform(scrollYProgress, [0, 1], [30, 52]);

  return (
    <section className="relative px-5 pt-16 sm:pt-24">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="display text-[32px] font-light text-white sm:text-[48px] lg:text-[56px]">
          Rate Discovery on Noctrum isn&apos;t Public. <br className="hidden md:block" />
          It&apos;s Sealed.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-base">
          Lenders encrypt their rates before they leave the browser. Only the confidential runtime can open them, and nobody else
          ever sees a bid, not even our server.
        </p>
      </Reveal>

      <div ref={ref} className="fade-bottom relative mx-auto mt-6 h-[300px] max-w-[760px] sm:mt-10 sm:h-[420px]" style={{ perspective: 1600 }}>
        <div
          className="absolute inset-x-0 top-[34%] h-[200px] sm:h-[260px]"
          style={{ transformStyle: "preserve-3d", transform: "rotateX(62deg)", transformOrigin: "50% 50%" }}
        >
          {Array.from({ length: PLATES }, (_, i) => (
            <Plate key={i} i={i} spread={spread} />
          ))}
        </div>
      </div>
    </section>
  );
}
