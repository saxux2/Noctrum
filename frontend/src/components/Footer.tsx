import Image from "next/image";

export default function Footer() {
  return (
    <footer className="relative min-h-[400px]">
      <Image
        src="/Ghost-footer.png"
        alt=""
        fill
        className="object-fill w-full h-full z-0 opacity-30"
        priority
      />
    </footer>
  );
}
