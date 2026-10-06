import mongoose from "mongoose";

// Random 20-byte alias that resolves to its owner's real account (BACKEND §2.4).
const shieldedAddressSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    createdAt: { type: Number, required: true },
  },
  { timestamps: false },
);

shieldedAddressSchema.index({ owner: 1 });

const ShieldedAddressModel = mongoose.model("ShieldedAddress", shieldedAddressSchema);
export default ShieldedAddressModel;
