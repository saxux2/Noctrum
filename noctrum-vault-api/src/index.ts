import app from "./app";
import { config } from "./config";
import { connectDB } from "./db";
import { startIndexer } from "./indexer";

await connectDB();

if (config.INDEXER_ENABLED) startIndexer();

console.log(`NOCTRUM vault-api running on port ${config.PORT}`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
