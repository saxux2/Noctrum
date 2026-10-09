import Image from "next/image";

/**
 * A fanned stack of glass slabs drawn in CSS 3D, with an image on the front slab.
 * Pure CSS, so it stays sharp at any resolution or zoom level.
 */
export default function GlassStack({
  src,
  count = 13,
  gap = 24,
  width = 360,
  height = 420,
  rotateX = -10,
  rotateY = -42,
  imageSize = 210,
  className = "",
  style,
}: {
  src: string;
  count?: number;
  gap?: number;
  width?: number;
  height?: number;
  rotateX?: number;
  rotateY?: number;
  imageSize?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{ perspective: 2000, ...style }}>
      <div
        className="relative mx-auto"
        style={{
          width,
          height,
          transformStyle: "preserve-3d",
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        }}
      >
        {Array.from({ length: count }, (_, i) => count - 1 - i).map((i) => (
          <div
            key={i}
            className={`slab ${i === 0 ? "slab-front" : ""}`}
            style={{
              transform: `translateZ(${-i * gap}px)`,
              opacity: i === 0 ? 1 : 1 - i * (0.45 / count),
            }}
          >
            {i === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Image
                  src={src}
                  alt=""
                  width={imageSize * 2}
                  height={imageSize * 2}
                  quality={95}
                  className="drop-shadow-[0_24px_30px_rgba(10,8,60,0.75)]"
                  style={{ width: imageSize, height: imageSize, transform: "translateZ(30px)" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
