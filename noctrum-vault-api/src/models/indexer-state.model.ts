import mongoose from "mongoose";

const indexerStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    lastProcessedBlock: { type: Number, required: true },
  },
  { timestamps: false },
);

const IndexerStateModel = mongoose.model("IndexerState", indexerStateSchema);
export default IndexerStateModel;
