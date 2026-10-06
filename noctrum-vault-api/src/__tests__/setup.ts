// Test preload (bunfig.toml): fixed env + in-memory MongoDB replica set (transactions need one).
import { beforeAll, afterAll, beforeEach } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Must be set before anything imports ../config. Values from deployments/monad-testnet.json.
process.env.CHAIN_ID = "10143";
process.env.VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
process.env.EIP712_NAME = "NoctrumPrivateToken";
process.env.EIP712_VERSION = "0.0.1";
process.env.START_BLOCK = "1000";
process.env.LOG_RANGE = "100";
process.env.AUTH_WINDOW_SECONDS = "300";
process.env.INDEXER_ENABLED = "false";
process.env.TICKET_TTL_SECONDS = "3600";
// Anvil's public dev key #1, test-only.
process.env.TICKET_SIGNER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri("noctrum-vault-test"));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}, 600_000);

beforeEach(async () => {
  // Dynamic import: a static one would load ../config before the env above is set.
  const { setPolicyCheck, setWithdrawPolicyCheck } = await import("../policy");
  setPolicyCheck(async () => {}); // allow-all; tests override per case, never hit the RPC
  setWithdrawPolicyCheck(async () => {});
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
