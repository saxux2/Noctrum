import { Hono } from "hono";
import ghostRoute from "./routes/ghost.routes";
import { getPoolAddress } from "./external-api";
import { config } from "./config";
import { cors } from "hono/cors";
import { connectDB } from "./db";

await connectDB();

const app = new Hono();

app.use(
  cors({
    origin: "*",
  }),
);

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "1",
    poolAddress: getPoolAddress(),
  });
});

app.get("/cre-public-key", (c) => {
  return c.json({ publicKey: config.CRE_PUBLIC_KEY });
});

app.route("/api/v1", ghostRoute);

console.log(`GHOST server running on port ${config.PORT}`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
