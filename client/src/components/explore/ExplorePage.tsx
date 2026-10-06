"use client";

import { useState, useEffect, useMemo } from "react";
import { get } from "@/lib/noctrum";
import { nUSD, nETH } from "@/lib/constants";
import type { PoolRow } from "./data/mockData";
import HeroSection from "./HeroSection";
import FeaturedCarousel from "./FeaturedCarousel";
import FilterBar from "./FilterBar";
import PoolTable from "./PoolTable";

const ExplorePage = () => {
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [tokenFilter, setTokenFilter] = useState("All Tokens");
  const [networkFilter, setNetworkFilter] = useState("All Networks");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await get("/api/v1/internal/pending-intents");
        const lendIntents = data.lendIntents ?? [];
        const borrowIntents = data.borrowIntents ?? [];

        const nusdLends = lendIntents.filter(
          (i: any) => i.token?.toLowerCase() === nUSD.toLowerCase()
        ).length;
        const nusdBorrows = borrowIntents.filter(
          (i: any) => i.token?.toLowerCase() === nUSD.toLowerCase()
        ).length;
        const nethBorrows = borrowIntents.filter(
          (i: any) => i.token?.toLowerCase() === nETH.toLowerCase()
        ).length;

        setRows([
          { rank: 1, name: "Noctrum USD", ticker: "nUSD", iconSrc: "/nusd.png", lendIntents: nusdLends, borrowIntents: nusdBorrows },
          { rank: 2, name: "Noctrum ETH", ticker: "nETH", iconSrc: "/neth.png", lendIntents: 0, borrowIntents: nethBorrows },
        ]);
      } catch {
        setRows([
          { rank: 1, name: "Noctrum USD", ticker: "nUSD", iconSrc: "/nusd.png", lendIntents: 0, borrowIntents: 0 },
          { rank: 2, name: "Noctrum ETH", ticker: "nETH", iconSrc: "/neth.png", lendIntents: 0, borrowIntents: 0 },
        ]);
      }
    };
    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (tokenFilter !== "All Tokens" && row.ticker !== tokenFilter) return false;
      // Network filter: all pools are on Monad Testnet, so "Monad Testnet" shows all
      if (networkFilter !== "All Networks" && networkFilter !== "Monad Testnet") return false;
      // Status filter: all pools are active
      if (statusFilter !== "All Status" && statusFilter !== "Active") return false;
      if (search) {
        const q = search.toLowerCase();
        if (!row.name.toLowerCase().includes(q) && !row.ticker.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, tokenFilter, networkFilter, statusFilter, search]);

  return (
    <div className="w-full max-w-6xl mx-auto py-10 space-y-8 px-4">
      <HeroSection />
      <FeaturedCarousel />
      <FilterBar
        tokenFilter={tokenFilter}
        networkFilter={networkFilter}
        statusFilter={statusFilter}
        search={search}
        onTokenFilterChange={setTokenFilter}
        onNetworkFilterChange={setNetworkFilter}
        onStatusFilterChange={setStatusFilter}
        onSearchChange={setSearch}
      />
      <PoolTable rows={filteredRows} />
    </div>
  );
};

export default ExplorePage;
