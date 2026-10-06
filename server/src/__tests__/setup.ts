// Test preload (bunfig.toml): fixed env, mocked price feed, in-memory MongoDB.
import { beforeAll, afterAll, beforeEach, mock } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { priceState, resetPrice } from "./mock-price";

// Must be set before anything imports ../config. Values from deployments/monad-testnet.json.
process.env.TOKEN_ADDRESS = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5"; // nUSD
process.env.NETH_ADDRESS = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A"; // nETH
process.env.CRE_PUBLIC_KEY =
  "03a62ca0efd28497d24e1cc2dc587f8e7e20ebc3de0c2315778997ead8bedda649";
process.env.EXTERNAL_VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
process.env.CHAIN_ID = "10143";
process.env.INTERNAL_API_KEY = "";
// Throwaway key so getPoolAddress() is deterministic within a run (never a real key).
process.env.POOL_PRIVATE_KEY = "0x" + "11".repeat(32);

mock.module("../price", () => ({
  getEthPrice: async () => {
    priceState.calls++;
    return priceState.value;
  },
}));

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("noctrum-test"));
}, 600_000);

beforeEach(async () => {
  resetPrice();
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
