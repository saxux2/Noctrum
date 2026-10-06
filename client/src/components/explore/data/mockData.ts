export interface FeaturedPool {
  name: string;
  ticker: string;
  iconSrc: string;
}

export interface PoolRow {
  rank: number;
  name: string;
  ticker: string;
  iconSrc: string;
  lendIntents: number;
  borrowIntents: number;
}

export const featuredPools: FeaturedPool[] = [
  { name: "Noctrum USD", ticker: "nUSD", iconSrc: "/nusd.png" },
  { name: "Noctrum ETH", ticker: "nETH", iconSrc: "/neth.png" },
];
