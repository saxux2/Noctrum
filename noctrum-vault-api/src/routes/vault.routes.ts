import { Hono } from "hono";
import { authenticate, requireFields } from "../auth";
import { ApiError, errorResponse } from "../errors";
import { listTransactions, parseCursor, parseLimit } from "../history";
import { listBalances } from "../ledger";
import { generateShieldedAddress, parseAmount, parseFlags, parseRecipient, parseToken, privateTransfer } from "../transfers";
import { requestWithdrawal } from "../withdrawals";

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

vaultRoute.post("/private-transfer", async (c) => {
  try {
    const body = await readBody(c);
    requireFields(body, ["account", "recipient", "token", "amount", "timestamp", "auth"]);
    const sender = String(body.account);
    const flags = parseFlags(body.flags);
    const token = parseToken(body.token);
    const amount = parseAmount(body.amount);
    const recipient = parseRecipient(body.recipient);
    // The signed message names the sender `sender`; the body calls it `account`.
    authenticate(
      "Private Token Transfer",
      { sender, recipient, token: body.token, amount, flags, timestamp: body.timestamp },
      body.auth,
      sender,
    );
    const transaction_id = await privateTransfer({ sender, recipient, token, amount, flags });
    return c.json({ transaction_id });
  } catch (err) {
    return errorResponse(c, err);
  }
});

vaultRoute.post("/shielded-address", async (c) => {
  try {
    const body = await readBody(c);
    requireFields(body, ["account", "timestamp", "auth"]);
    const account = String(body.account);
    authenticate("Generate Shielded Address", { account, timestamp: body.timestamp }, body.auth, account);
    return c.json({ address: await generateShieldedAddress(account) });
  } catch (err) {
    return errorResponse(c, err);
  }
});

vaultRoute.post("/transactions", async (c) => {
  try {
    const body = await readBody(c);
    requireFields(body, ["account", "timestamp", "auth"]);
    const account = String(body.account);
    const limit = parseLimit(body.limit);
    const cursor = parseCursor(body.cursor);
    // Clients sign cursor "" when they send none (CPT api-scripts/transactions.ts).
    authenticate(
      "List Transactions",
      { account, timestamp: body.timestamp, cursor: (body.cursor as string | undefined) ?? "", limit },
      body.auth,
      account,
    );
    return c.json(await listTransactions(account, limit, cursor));
  } catch (err) {
    return errorResponse(c, err);
  }
});

vaultRoute.post("/withdraw", async (c) => {
  try {
    const body = await readBody(c);
    requireFields(body, ["account", "token", "amount", "timestamp", "auth"]);
    const account = String(body.account);
    const token = parseToken(body.token);
    const amount = parseAmount(body.amount);
    authenticate(
      "Withdraw Tokens",
      { account, token: body.token, amount, timestamp: body.timestamp },
      body.auth,
      account,
    );
    return c.json(await requestWithdrawal({ account, token, amount }));
  } catch (err) {
    return errorResponse(c, err);
  }
});

export default vaultRoute;
