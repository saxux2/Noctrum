import mongoose from "mongoose";
import { config } from "./config";

export async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.log(err);
  }
}
