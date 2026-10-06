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
  { name: "Ghost USD", ticker: "nUSD", iconSrc: "/nusd.png" },
  { name: "Ghost ETH", ticker: "nETH", iconSrc: "/neth.png" },
];
