import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import app from "../app";
import { creditBalance } from "../ledger";
import { expectErrorShape, NETH, NUSD, post, signTyped, ts, wei } from "./helpers";

const alice = ethers.Wallet.createRandom();
const bob = ethers.Wallet.createRandom();

// Body exactly as client/src/lib/noctrum.ts, noctrum-tg api.ts and e2e helpers send it.
async function balancesBody(wallet: ethers.HDNodeWallet, timestamp = ts()) {
  const message = { account: wallet.address, timestamp };
  const auth = await signTyped(wallet, "Retrieve Balances", message);
  return { account: wallet.address, timestamp, auth };
}

describe("POST /balances", () => {
  test("empty account returns an empty list", async () => {
    const res = await post("/balances", await balancesBody(alice));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balances: [] });
  });

  test("returns [{token, amount}] wei strings for the signer only", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(10)));
    await creditBalance(alice.address, NETH, BigInt(wei("0.5")));
    await creditBalance(bob.address, NUSD, BigInt(wei(99)));

    const res = await post("/balances", await balancesBody(alice));
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.balances).toHaveLength(2);
    expect(json.balances).toEqual(
      expect.arrayContaining([
        { token: NUSD, amount: wei(10) },
        { token: NETH, amount: wei("0.5") },
      ]),
    );

    // Client lookup: case-insensitive token match
    const find = (tok: string) =>
      json.balances.find((b: any) => b.token.toLowerCase() === tok.toLowerCase())?.amount ?? "0";
    expect(find("0x339a948f3667d222FAD43d313b3b8c3BE1415ad5")).toBe(wei(10));
  });

  test("missing fields → 400 bad_request", async () => {
    const res = await post("/balances", { account: alice.address });
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "bad_request");
  });

  test("non-JSON body → 400 bad_request", async () => {
    const res = await post("/balances", "not json");
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "bad_request");
  });

  test("signature for another account → 401 request_auth_failed", async () => {
    const body = await balancesBody(bob);
    const res = await post("/balances", { ...body, account: alice.address });
    expect(res.status).toBe(401);
    expectErrorShape(await res.json(), "request_auth_failed");
  });

  test("stale timestamp → 401 request_auth_expired", async () => {
    const res = await post("/balances", await balancesBody(alice, ts() - 600));
    expect(res.status).toBe(401);
    expectErrorShape(await res.json(), "request_auth_expired");
  });
});

test("GET /health", async () => {
  const res = await app.request("/health");
  expect(await res.json()).toEqual({
    status: "ok",
    chainId: 10143,
    vault: "0x65877F6BFd3f2D293454658BCb290b112397Eeb5",
  });
});
