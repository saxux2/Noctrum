import app from "./app";
import { config } from "./config";
import { connectDB } from "./db";
import { startIndexer } from "./indexer";
import { startInvariantJob } from "./invariant";
import { checkTicketSigner } from "./withdrawals";

await connectDB();
await checkTicketSigner();

// The refund sweeper runs inside the indexer loop; the invariant needs indexed state.
if (config.INDEXER_ENABLED) {
  startIndexer();
  startInvariantJob();
}

console.log(`NOCTRUM vault-api running on port ${config.PORT}`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
