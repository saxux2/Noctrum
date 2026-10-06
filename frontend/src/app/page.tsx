import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Announcement from "@/components/Announcement";
import Features from "@/components/Features";
import Partners from "@/components/Partners";
import TokenBanner from "@/components/TokenBanner";
import FollowAlong from "@/components/FollowAlong";
import CtaBanner from "@/components/CtaBanner";
import Footer from "@/components/Footer";
import SmoothScroll from "@/components/SmoothScroll";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ghost Finance",
  url: "https://ghost-finance.xyz",
  applicationCategory: "FinanceApplication",
  description:
    "Private peer-to-peer lending with sealed-bid rate discovery. Lenders submit encrypted rates, borrowers get matched to the cheapest — all settled inside Chainlink's confidential compute runtime.",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    category: "DeFi Lending",
  },
  creator: {
    "@type": "Organization",
    name: "Ghost Finance",
    url: "https://ghost-finance.xyz",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SmoothScroll>
        <main className="min-h-screen">
          <Navbar />
          <Hero />
          <Announcement />
          <Features />
          <Partners />
          <TokenBanner />
          <FollowAlong />
          <CtaBanner />
          <Footer />
        </main>
      </SmoothScroll>
    </>
  );
}
