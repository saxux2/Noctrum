import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import PrivyProviderWrapper from "@/components/providers/privy-provider";
import CoreLayout from "@/components/layouts/CoreLayout";

const poppins = Poppins({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["100", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Ghost Finance",
  description: "GHOST Protocol — Private P2P Lending on Chainlink CRE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <body className={`${poppins.className} antialiased`}>
        <PrivyProviderWrapper>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
              <CoreLayout>{children}</CoreLayout>
          </ThemeProvider>
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}
