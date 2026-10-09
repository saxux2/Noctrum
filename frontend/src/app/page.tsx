import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import BuiltWith from "@/components/landing/BuiltWith";
import Sealed from "@/components/landing/Sealed";
import Stats from "@/components/landing/Stats";
import Quote from "@/components/landing/Quote";
import Mechanics from "@/components/landing/Mechanics";
import Ecosystem from "@/components/landing/Ecosystem";
import Connect from "@/components/landing/Connect";
import Footer from "@/components/landing/Footer";
import SmoothScroll from "@/components/SmoothScroll";
import { site } from "@/constants/links";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Noctrum Finance",
  url: site,
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
    name: "Noctrum Finance",
    url: site,
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
        <main className="min-h-screen overflow-x-clip bg-ink">
          <Nav />
          <Hero />
          <BuiltWith />
          <Sealed />
          <Stats />
          <Quote />
          <Mechanics />
          <Ecosystem />
          <Connect />
          <Footer />
        </main>
      </SmoothScroll>
    </>
  );
}
