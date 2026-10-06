import { describe, expect } from "bun:test";
import { newTestRuntime, test, ConfidentialHttpMock } from "@chainlink/cre-sdk/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { getDomain, TRANSFER_TYPES } from "./eip712";
import { onCronTrigger, initWorkflow, type Config, type PendingTransfer } from "./main";

const VAULT = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
const NUSD = "0x339a948f3667d222fad43d313b3b8c3be1415ad5";
const config: Config = {
  schedule: "*/15 * * * * *",
  noctrumApiUrl: "https://api.test/api/v1",
  externalApiUrl: "https://vault-api.test",
  vaultAddress: VAULT,
  chainId: 10143,
};
const base = config.noctrumApiUrl;
const transferUrl = config.externalApiUrl + "/private-transfer";

const poolKey = generatePrivateKey();
const pool = privateKeyToAccount(poolKey);

const pending = (n: number): PendingTransfer[] =>
  Array.from({ length: n }, (_, i) => ({
    id: "t" + (i + 1),
    recipient: privateKeyToAccount(generatePrivateKey()).address,
    token: NUSD,
    amount: String(BigInt(i + 1) * 10n ** 18n),
    reason: "disburse",
  }));

type Call = { url: string; method: string; body: string; secrets: string[] };

function mockApi(handle: (url: string, method: string, body: string) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const mock = ConfidentialHttpMock.testInstance();
  mock.sendRequest = (input) => {
    const req = input.request!;
    const body = req.body.case === "bodyString" ? req.body.value : "";
    calls.push({
      url: req.url,
      method: req.method,
      body,
      secrets: input.vaultDonSecrets.map((s) => s.namespace + "/" + s.key),
    });
    const res = handle(req.url, req.method, body);
    return {
      statusCode: res.status ?? 200,
      body: Buffer.from(JSON.stringify(res.json ?? {})).toString("base64"),
    };
  };
  return calls;
}

function runtimeWith(secrets: Record<string, string> = { POOL_PRIVATE_KEY: poolKey }) {
  const runtime = newTestRuntime(new Map([["default", new Map(Object.entries(secrets))]]));
  (runtime as any).config = config;
  return runtime as any;
}

describe("EIP-712 domain and types", () => {
  test("match the noctrum-vault-api verifier (D-5)", () => {
    expect(getDomain(config)).toEqual({
      name: "NoctrumPrivateToken",
      version: "0.0.1",
      chainId: 10143,
      verifyingContract: VAULT,
    });
    expect(TRANSFER_TYPES).toEqual({
      "Private Token Transfer": [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "flags", type: "string[]" },
        { name: "timestamp", type: "uint256" },
      ],
    });
  });
});

describe("onCronTrigger", () => {
  test("signs and sends at most 3 transfers, then confirms them", async () => {
    const transfers = pending(5);
    let confirmed: any;
    const calls = mockApi((url, _m, body) => {
      if (url === base + "/internal/pending-transfers") return { json: { transfers } };
      if (url === base + "/internal/confirm-transfers") {
        confirmed = JSON.parse(body);
        return { json: { confirmed: confirmed.transferIds.length } };
      }
      return { json: { success: true } };
    });

    const before = Math.floor(Date.now() / 1000);
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("executed=3 failed=0");
    const after = Math.floor(Date.now() / 1000);

    // 1 fetch + 3 transfers + 1 confirm = 5 (CRE limit)
    expect(calls.map((c) => c.method + " " + c.url)).toEqual([
      `GET ${base}/internal/pending-transfers`,
      `POST ${transferUrl}`,
      `POST ${transferUrl}`,
      `POST ${transferUrl}`,
      `POST ${base}/internal/confirm-transfers`,
    ]);
    expect(calls[0]!.secrets).toEqual(["noctrum-protocol/INTERNAL_API_KEY"]);
    expect(calls[4]!.secrets).toEqual(["noctrum-protocol/INTERNAL_API_KEY"]);
    expect(confirmed).toEqual({ transferIds: ["t1", "t2", "t3"] });

    for (const [i, call] of calls.slice(1, 4).entries()) {
      const t = transfers[i]!;
      expect(call.secrets).toEqual([]);
      const body = JSON.parse(call.body);
      expect(body).toMatchObject({
        account: pool.address,
        recipient: t.recipient,
        token: t.token,
        amount: t.amount,
        flags: [],
      });
      expect(body.timestamp).toBeGreaterThanOrEqual(before);
      expect(body.timestamp).toBeLessThanOrEqual(after);

      const valid = await verifyTypedData({
        address: pool.address,
        domain: getDomain(config),
        types: TRANSFER_TYPES,
        primaryType: "Private Token Transfer",
        message: {
          sender: pool.address,
          recipient: t.recipient as `0x${string}`,
          token: t.token as `0x${string}`,
          amount: BigInt(t.amount),
          flags: [],
          timestamp: BigInt(body.timestamp),
        },
        signature: body.auth,
      });
      expect(valid).toBe(true);
    }
  });

  test("accepts a pool key without 0x", async () => {
    mockApi((url) =>
      url.endsWith("/pending-transfers") ? { json: { transfers: pending(1) } } : { json: {} },
    );
    const runtime = runtimeWith({ POOL_PRIVATE_KEY: poolKey.slice(2) });
    expect(await onCronTrigger(runtime, {} as any)).toBe("executed=1 failed=0");
  });

  test("confirms only the transfers that succeeded", async () => {
    const transfers = pending(3);
    let confirmed: any;
    mockApi((url, _m, body) => {
      if (url.endsWith("/pending-transfers")) return { json: { transfers } };
      if (url.endsWith("/confirm-transfers")) {
        confirmed = JSON.parse(body);
        return { json: {} };
      }
      return JSON.parse(body).recipient === transfers[1]!.recipient ? { status: 400 } : { json: {} };
    });
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("executed=2 failed=1");
    expect(confirmed).toEqual({ transferIds: ["t1", "t3"] });
  });

  test("a bad amount counts as failed", async () => {
    const transfers = pending(2);
    transfers[0]!.amount = "not-a-number";
    mockApi((url) => (url.endsWith("/pending-transfers") ? { json: { transfers } } : { json: {} }));
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("executed=1 failed=1");
  });

  test("returns no-pending when the queue is empty", async () => {
    const calls = mockApi(() => ({ json: { transfers: [] } }));
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("no-pending");
    expect(calls).toHaveLength(1);
  });

  test("returns error:fetch-pending when the queue cannot be read", async () => {
    mockApi(() => ({ status: 500 }));
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("error:fetch-pending");
  });

  test("returns error:no-pool-key when the secret is empty", async () => {
    mockApi(() => ({ json: { transfers: pending(1) } }));
    expect(await onCronTrigger(runtimeWith({ POOL_PRIVATE_KEY: "" }), {} as any)).toBe("error:no-pool-key");
  });

  test("returns error:all-failed and skips confirm when every transfer fails", async () => {
    const calls = mockApi((url) =>
      url.endsWith("/pending-transfers") ? { json: { transfers: pending(2) } } : { status: 500 },
    );
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("error:all-failed");
    expect(calls.some((c) => c.url.endsWith("/confirm-transfers"))).toBe(false);
  });

  test("returns error:confirm-failed when confirmation fails", async () => {
    mockApi((url) => {
      if (url.endsWith("/pending-transfers")) return { json: { transfers: pending(2) } };
      if (url.endsWith("/confirm-transfers")) return { status: 500 };
      return { json: {} };
    });
    expect(await onCronTrigger(runtimeWith(), {} as any)).toBe("error:confirm-failed executed=2");
  });
});

describe("initWorkflow", () => {
  test("registers one cron handler with the configured schedule", () => {
    const handlers = initWorkflow(config);
    expect(handlers).toHaveLength(1);
    const trigger = handlers[0]!.trigger;
    expect(trigger.capabilityId()).toStartWith("cron-trigger@");
    expect((trigger as unknown as { config: { schedule: string } }).config.schedule).toBe(config.schedule);
  });
});
