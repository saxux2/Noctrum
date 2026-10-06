"use client";
import { motion } from "framer-motion";

export default function Hero() {

  return (
    <section className="min-h-[80vh] overflow-hidden relative bg-[#101010]">
      <motion.img
        src="/bgimg.jpg"
        alt=""
        initial={{ opacity: 0, y: 40, scale: 1.05 }}
        animate={{ opacity: 0.4, y: 0, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 h-[500px] z-[1]" style={{ background: 'linear-gradient(to top, #101010 0%, #101010e6 20%, #10101099 50%, #10101033 75%, transparent 100%)' }} />
      <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center text-center px-8">
        <motion.img
          src="/Hero Text.png"
          alt="Private Lending. Fair Rates."
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="max-w-2xl w-full"
        />
      </div>
    </section>
  );
}
