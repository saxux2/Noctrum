import mongoose from "mongoose";

const indexerStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    lastProcessedBlock: { type: Number, required: true },
    // Timestamp of the finalized head once the indexer has caught up to it.
    // No ticket with an earlier deadline can still be redeemed unseen (refund sweeper guard).
    lastProcessedTimestamp: { type: Number },
  },
  { timestamps: false },
);

const IndexerStateModel = mongoose.model("IndexerState", indexerStateSchema);
export default IndexerStateModel;
