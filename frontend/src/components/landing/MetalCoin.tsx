/**
 * A chrome coin drawn in CSS + SVG (no bitmaps), so it is sharp at any size.
 * The face is an ellipse tilted like a coin standing on its edge; stacked
 * shadows give it a visible rim.
 */

const glyphs: Record<string, React.ReactNode> = {
  nusd: (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4">
      <path d="M12 2.5v19" />
      <path d="M16.6 6.2H9.7a3.1 3.1 0 0 0 0 6.2h4.6a3.1 3.1 0 0 1 0 6.2H6.9" />
    </g>
  ),
  monad: <rect x="6.3" y="6.3" width="11.4" height="11.4" rx="3.6" transform="rotate(45 12 12)" fill="none" strokeWidth="3.4" />,
  noctrum: (
    <g strokeWidth="0.6" strokeLinejoin="round">
      <path d="M8.6 4h9.1c.8 0 1.3.9.9 1.6l-3.1 5.4c-.3.5-.8.8-1.4.8H5c-.8 0-1.3-.9-.9-1.6l3.1-5.4c.3-.5.8-.8 1.4-.8Z" />
      <path d="M11.4 12.6h8.1c.8 0 1.3.9.9 1.6l-3.1 5.2c-.3.5-.8.8-1.4.8H7.8c-.8 0-1.3-.9-.9-1.6l3.1-5.2c.3-.5.8-.8 1.4-.8Z" opacity="0.75" />
    </g>
  ),
  chainlink: <path d="M12 2.8 19.9 7.4v9.2L12 21.2l-7.9-4.6V7.4L12 2.8Z" fill="none" strokeWidth="3.4" strokeLinejoin="round" />,
  ethereum: (
    <g strokeWidth="0.5" strokeLinejoin="round">
      <path d="M12 2 18.6 12.3 12 16.1 5.4 12.3 12 2Z" />
      <path d="M12 17.6 18.6 13.8 12 22 5.4 13.8 12 17.6Z" />
    </g>
  ),
};

export type CoinGlyph = keyof typeof glyphs;

export default function MetalCoin({ glyph, label, size }: { glyph: CoinGlyph; label: string; size: string }) {
  const id = `chrome-${glyph}`;
  return (
    <div role="img" aria-label={label} className="metal-coin" style={{ width: `calc(${size} * 0.8)`, height: size }}>
      <div className="metal-coin-inner">
        <svg viewBox="0 0 24 24" className="metal-coin-glyph" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4a5590" />
              <stop offset="0.45" stopColor="#1c2250" />
              <stop offset="0.75" stopColor="#2e3670" />
              <stop offset="1" stopColor="#141a3e" />
            </linearGradient>
          </defs>
          <g fill={`url(#${id})`} stroke={`url(#${id})`}>
            {glyphs[glyph]}
          </g>
        </svg>
      </div>
    </div>
  );
}
