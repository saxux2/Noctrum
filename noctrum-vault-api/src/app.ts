import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import vaultRoute from "./routes/vault.routes";

const app = new Hono();

app.use(cors({ origin: "*" }));

app.get("/health", (c) =>
  c.json({ status: "ok", chainId: config.CHAIN_ID, vault: config.VAULT_ADDRESS }),
);

app.route("/", vaultRoute);

export default app;
