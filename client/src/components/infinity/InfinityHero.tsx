"use client";

const stats = [
  { value: "Private", label: "Sealed-Rate Lending" },
  { value: "Monad", label: "Testnet Live" },
  { value: "CRE", label: "Chainlink Powered" },
];

const InfinityHero = () => {
  return (
    <section className="relative w-full overflow-hidden rounded-2xl px-10 py-16 text-white">
      {/* Cover photo */}
      <img
        src="/dungeon-cover.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 max-w-xl space-y-6">
        {/* Badge */}
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium text-white/80">Noctrum Protocol</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-semibold leading-tight tracking-tight text-white">
          Private P2P Lending<br />with Sealed Rates
        </h1>

        {/* Subtitle */}
        <p className="text-base text-white/80 leading-relaxed max-w-md">
          The first lending protocol where rates are encrypted, matched
          confidentially by Chainlink CRE, and settled on-chain — no one
          sees your bid.
        </p>

        {/* Stats */}
        <div className="flex items-center gap-10 pt-2">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-semibold text-white">{s.value}</p>
              <p className="text-sm text-white/70">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default InfinityHero;
