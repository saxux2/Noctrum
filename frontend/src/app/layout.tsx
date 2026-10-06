import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["100", "400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ghost-finance.xyz"),
  title: {
    default: "Ghost Finance: Private P2P Lending on Chainlink CRE",
    template: "%s | Ghost Finance",
  },
  description:
    "Private peer-to-peer lending with sealed-bid rate discovery. Lenders submit encrypted rates, borrowers get matched to the cheapest — all settled inside Chainlink's confidential compute runtime.",
  keywords: [
    "Ghost Finance",
    "Ghost Protocol",
    "DeFi lending",
    "private lending",
    "P2P lending",
    "sealed-bid auction",
    "Chainlink CRE",
    "confidential compute",
    "rate discovery",
    "discriminatory pricing",
    "gUSD",
    "gETH",
    "shielded transfers",
    "decentralized finance",
    "crypto lending",
    "DeFi protocol",
    "private DeFi",
    "Ethereum",
    "Web3",
  ],
  authors: [{ name: "Ghost Finance" }],
  creator: "Ghost Finance",
  publisher: "Ghost Finance",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Ghost Finance — Private P2P Lending on Chainlink CRE",
    description:
      "Sealed-bid rate discovery, confidential compute matching, and shielded transfers. Fair lending markets, private by default.",
    url: "https://ghost-finance.xyz",
    siteName: "Ghost Finance",
    images: [
      {
        url: "/SEO-BANNER.png",
        width: 1200,
        height: 630,
        alt: "Ghost Finance — Private P2P Lending Protocol",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghost Finance — Private P2P Lending on Chainlink CRE",
    description:
      "Sealed-bid rate discovery, confidential compute matching, and shielded transfers. Fair lending markets, private by default.",
    images: ["/SEO-BANNER.png"],
    creator: "@ghostfinance",
    site: "@ghostfinance",
  },
  alternates: {
    canonical: "https://ghost-finance.xyz",
  },
  category: "finance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${poppins.variable} ${poppins.className} bg-[#101010] text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
