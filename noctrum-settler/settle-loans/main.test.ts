import { describe, expect } from "bun:test";
import { newTestRuntime, test, ConfidentialHttpMock } from "@chainlink/cre-sdk/test";
import { encrypt, PrivateKey } from "eciesjs";
import { decryptRate, runMatchingEngine, type LendIntent, type BorrowIntent } from "./matching";
import { onCronTrigger, initWorkflow, type Config } from "./main";

const NUSD = "0x339a948f3667d222fad43d313b3b8c3be1415ad5";
const NETH = "0x39ad31e31b8b202e6fa7bd8682e68ac4e66ce92a";
const config: Config = { schedule: "*/30 * * * * *", noctrumApiUrl: "https://api.test/api/v1" };

const key = new PrivateKey();
const privHex = Buffer.from(key.secret).toString("hex");
const encHex = (rate: string) =>
  Buffer.from(encrypt(key.publicKey.toHex(true), Buffer.from(rate))).toString("hex");

const lend = (intentId: string, amount: string, rate: string, token = NUSD): LendIntent => ({
  intentId,
  userId: "lender-" + intentId,
  token,
  amount,
  encryptedRate: rate,
});

const borrow = (intentId: string, amount: string, maxRate: string, token = NUSD): BorrowIntent => ({
  intentId,
  borrower: "borrower-" + intentId,
  token,
  amount,
  encryptedMaxRate: maxRate,
  collateralToken: NETH,
  collateralAmount: "1000000000000000000",
  status: "pending",
});

// ── decryptRate ─────────────────────────────────────

describe("decryptRate", () => {
  test("plaintext rate in (0,1) is used as-is", () => {
    expect(decryptRate("0.07")).toBe(0.07);
    expect(decryptRate("0.07", privHex)).toBe(0.07);
  });

  test("bare hex ciphertext decrypts to the real rate", () => {
    expect(decryptRate(encHex("0.0725"), privHex)).toBe(0.0725);
  });

  test("0x-prefixed ciphertext decrypts to the real rate (D-2 fix)", () => {
    expect(decryptRate("0x" + encHex("0.0725"), privHex)).toBe(0.0725);
    expect(decryptRate("0X" + encHex("0.031"), privHex)).toBe(0.031);
  });

  test("falls back to 0.05 on garbage, missing key, wrong key or out-of-range rate", () => {
    expect(decryptRate("not-a-rate", privHex)).toBe(0.05);
    expect(decryptRate("0x" + encHex("0.0725"))).toBe(0.05);
    const other = Buffer.from(new PrivateKey().secret).toString("hex");
    expect(decryptRate("0x" + encHex("0.0725"), other)).toBe(0.05);
    expect(decryptRate(encHex("1.5"), privHex)).toBe(0.05);
    expect(decryptRate("1.5")).toBe(0.05);
    expect(decryptRate("0")).toBe(0.05);
  });
});

// ── runMatchingEngine ───────────────────────────────

describe("runMatchingEngine", () => {
  test("fills cheapest lends first and blends the rate", () => {
    const proposals = runMatchingEngine(
      [lend("B", "500", "0.08"), lend("A", "500", "0.05")],
      [borrow("X", "800", "0.10")],
    );
    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    expect(p.borrowIntentId).toBe("X");
    expect(p.borrower).toBe("borrower-X");
    expect(p.token).toBe(NUSD);
    expect(p.principal).toBe("800");
    expect(p.matchedTicks).toEqual([
      { lender: "lender-A", lendIntentId: "A", amount: "500", rate: 0.05 },
      { lender: "lender-B", lendIntentId: "B", amount: "300", rate: 0.08 },
    ]);
    expect(p.effectiveBorrowerRate).toBeCloseTo(0.06125, 12);
    expect(p.collateralToken).toBe(NETH);
    expect(p.collateralAmount).toBe("1000000000000000000");
    expect(p.proposalId).toMatch(/^p-[0-9a-z]+-[0-9a-z]{1,6}$/);
  });

  test("blended rate above max yields no proposal and restores the lends", () => {
    // X (800) is matched first, blends to 0.06125 > 0.055 and is dropped.
    // Y (400) must then still see A's full 500 at 0.05.
    const proposals = runMatchingEngine(
      [lend("A", "500", "0.05"), lend("B", "500", "0.08")],
      [borrow("Y", "400", "0.10"), borrow("X", "800", "0.055")],
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.borrowIntentId).toBe("Y");
    expect(proposals[0]!.matchedTicks).toEqual([
      { lender: "lender-A", lendIntentId: "A", amount: "400", rate: 0.05 },
    ]);
    expect(proposals[0]!.effectiveBorrowerRate).toBe(0.05);
  });

  test("skips lends in a different token", () => {
    const proposals = runMatchingEngine(
      [lend("E", "1000", "0.01", NETH), lend("A", "500", "0.05")],
      [borrow("X", "500", "0.10")],
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.matchedTicks.map((t) => t.lendIntentId)).toEqual(["A"]);

    expect(runMatchingEngine([lend("E", "1000", "0.01", NETH)], [borrow("X", "500", "0.10")])).toEqual([]);
  });

  test("allows partial fills", () => {
    const proposals = runMatchingEngine(
      [lend("A", "200", "0.05"), lend("B", "100", "0.06")],
      [borrow("X", "800", "0.10")],
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.principal).toBe("300");
    expect(proposals[0]!.matchedTicks.map((t) => t.amount)).toEqual(["200", "100"]);
  });

  test("matches the largest borrow first", () => {
    const proposals = runMatchingEngine(
      [lend("A", "700", "0.05")],
      [borrow("small", "300", "0.10"), borrow("large", "700", "0.10")],
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.borrowIntentId).toBe("large");
    expect(proposals[0]!.principal).toBe("700");
  });

  test("one lend can serve several borrows", () => {
    const proposals = runMatchingEngine(
      [lend("A", "1000", "0.05")],
      [borrow("X", "600", "0.10"), borrow("Y", "300", "0.10")],
    );
    expect(proposals.map((p) => [p.borrowIntentId, p.principal])).toEqual([
      ["X", "600"],
      ["Y", "300"],
    ]);
  });

  test("decrypts 0x-prefixed encrypted bids when the key is given", () => {
    const proposals = runMatchingEngine(
      [lend("A", "500", "0x" + encHex("0.03")), lend("B", "500", "0x" + encHex("0.09"))],
      [borrow("X", "600", "0x" + encHex("0.04"))],
      privHex,
    );
    // 500 @ 0.03 + 100 @ 0.09 = 0.04 blended, exactly at max
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.matchedTicks.map((t) => t.rate)).toEqual([0.03, 0.09]);
    expect(proposals[0]!.effectiveBorrowerRate).toBeCloseTo(0.04, 12);
  });
});

// ── handler (ConfidentialHTTP mocked) ───────────────

type Call = { url: string; method: string; body: string; headers: Record<string, string[]>; secrets: string[] };

function mockApi(routes: Record<string, (body: string) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const mock = ConfidentialHttpMock.testInstance();
  mock.sendRequest = (input) => {
    const req = input.request!;
    const body = req.body.case === "bodyString" ? req.body.value : "";
    const headers = Object.fromEntries(Object.entries(req.multiHeaders).map(([k, v]) => [k, v.values]));
    calls.push({
      url: req.url,
      method: req.method,
      body,
      headers,
      secrets: input.vaultDonSecrets.map((s) => s.namespace + "/" + s.key),
    });
    const route = routes[req.method + " " + req.url];
    if (!route) return { statusCode: 404, body: "" };
    const res = route(body);
    return {
      statusCode: res.status ?? 200,
      body: Buffer.from(JSON.stringify(res.json)).toString("base64"),
    };
  };
  return calls;
}

function runtimeWith(secrets?: Record<string, string>) {
  const runtime = newTestRuntime(secrets ? new Map([["default", new Map(Object.entries(secrets))]]) : null);
  (runtime as any).config = config;
  return runtime as any;
}

const base = config.noctrumApiUrl;

describe("onCronTrigger", () => {
  test("expires, fetches, matches and records proposals", () => {
    let recorded: any;
    const calls = mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ json: { expired: 0 } }),
      [`GET ${base}/internal/pending-intents`]: () => ({
        json: {
          lendIntents: [lend("A", "500", "0x" + encHex("0.05")), lend("B", "500", "0x" + encHex("0.08"))],
          borrowIntents: [borrow("X", "800", "0x" + encHex("0.10"))],
        },
      }),
      [`POST ${base}/internal/record-match-proposals`]: (body) => {
        recorded = JSON.parse(body);
        return { json: { recorded: recorded.proposals.length } };
      },
    });
    const runtime = runtimeWith({ CRE_PRIVATE_KEY: privHex });

    expect(onCronTrigger(runtime, {} as any)).toBe("matched:1 recorded:1");

    expect(calls.map((c) => c.method + " " + c.url.slice(base.length))).toEqual([
      "POST /internal/expire-proposals",
      "GET /internal/pending-intents",
      "POST /internal/record-match-proposals",
    ]);
    for (const c of calls) {
      expect(c.secrets).toEqual(["noctrum-protocol/INTERNAL_API_KEY"]);
      expect(c.headers["x-api-key"]).toEqual(["{{.INTERNAL_API_KEY}}"]);
    }
    expect(calls[0]!.body).toBe("{}");
    expect(recorded.proposals[0].principal).toBe("800");
    expect(recorded.proposals[0].effectiveBorrowerRate).toBeCloseTo(0.06125, 12);

    const logs = runtime.getLogs().join("\n");
    expect(logs).toContain("settle-loans triggered");
    expect(logs).toContain("settle-loans result: matched:1 recorded:1");
  });

  test("without CRE_PRIVATE_KEY encrypted bids fall back to 0.05", () => {
    let recorded: any;
    mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ json: {} }),
      [`GET ${base}/internal/pending-intents`]: () => ({
        json: {
          lendIntents: [lend("A", "500", "0x" + encHex("0.02"))],
          borrowIntents: [borrow("X", "500", "0x" + encHex("0.03"))],
        },
      }),
      [`POST ${base}/internal/record-match-proposals`]: (body) => {
        recorded = JSON.parse(body);
        return { json: { recorded: 1 } };
      },
    });
    const runtime = runtimeWith();

    expect(onCronTrigger(runtime, {} as any)).toBe("matched:1 recorded:1");
    expect(recorded.proposals[0].effectiveBorrowerRate).toBe(0.05);
    expect(runtime.getLogs().join("\n")).toContain("CRE_PRIVATE_KEY not available");
  });

  test("ignores a failed expire call", () => {
    mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ status: 500, json: {} }),
      [`GET ${base}/internal/pending-intents`]: () => ({ json: { lendIntents: [], borrowIntents: [] } }),
    });
    expect(onCronTrigger(runtimeWith(), {} as any)).toBe("no-match");
  });

  test("returns error:fetch-intents when intents cannot be fetched", () => {
    mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ json: {} }),
      [`GET ${base}/internal/pending-intents`]: () => ({ status: 401, json: { error: "unauthorized" } }),
    });
    expect(onCronTrigger(runtimeWith(), {} as any)).toBe("error:fetch-intents");
  });

  test("returns no-match when a side is empty", () => {
    const calls = mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ json: {} }),
      [`GET ${base}/internal/pending-intents`]: () => ({ json: { lendIntents: [lend("A", "500", "0.05")] } }),
    });
    expect(onCronTrigger(runtimeWith(), {} as any)).toBe("no-match");
    expect(calls).toHaveLength(2);
  });

  test("returns no-proposals when nothing clears", () => {
    const calls = mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ json: {} }),
      [`GET ${base}/internal/pending-intents`]: () => ({
        json: { lendIntents: [lend("A", "500", "0.09")], borrowIntents: [borrow("X", "500", "0.05")] },
      }),
    });
    expect(onCronTrigger(runtimeWith(), {} as any)).toBe("no-proposals");
    expect(calls).toHaveLength(2);
  });

  test("returns error:record-proposals when recording fails", () => {
    mockApi({
      [`POST ${base}/internal/expire-proposals`]: () => ({ json: {} }),
      [`GET ${base}/internal/pending-intents`]: () => ({
        json: { lendIntents: [lend("A", "500", "0.05")], borrowIntents: [borrow("X", "500", "0.10")] },
      }),
      [`POST ${base}/internal/record-match-proposals`]: () => ({ status: 500, json: {} }),
    });
    expect(onCronTrigger(runtimeWith(), {} as any)).toBe("error:record-proposals");
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
