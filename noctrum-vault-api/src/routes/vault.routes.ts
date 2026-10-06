import { Hono } from "hono";
import { authenticate, requireFields } from "../auth";
import { ApiError, errorResponse } from "../errors";
import { listBalances } from "../ledger";

const vaultRoute = new Hono();

async function readBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    const body = await c.req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {}
  throw new ApiError("bad_request", "Request body must be a JSON object");
}

vaultRoute.post("/balances", async (c) => {
  try {
    const body = await readBody(c);
    requireFields(body, ["account", "timestamp", "auth"]);
    const account = String(body.account);
    authenticate("Retrieve Balances", { account, timestamp: body.timestamp }, body.auth, account);
    return c.json({ balances: await listBalances(account) });
  } catch (err) {
    return errorResponse(c, err);
  }
});

export default vaultRoute;
