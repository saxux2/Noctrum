import { describe, expect } from "bun:test";
import { getNetwork } from "@chainlink/cre-sdk";
import { newTestRuntime, test, ConfidentialHttpMock, EvmMock, addContractMock } from "@chainlink/cre-sdk/test";
import { PriceFeedAggregator } from "../contracts/abi";
import { onCronTrigger, initWorkflow, type Config, type Loan } from "./main";

const NUSD = "0x339a948f3667d222fad43d313b3b8c3be1415ad5";
const NETH = "0x39ad31e31b8b202e6fa7bd8682e68ac4e66ce92a";
const config: Config = {
  schedule: "*/60 * * * * *",
  noctrumApiUrl: "https://api.test/api/v1",
  feedChainName: "ethereum-mainnet-arbitrum-1",
  ethUsdFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  liquidationThreshold: 1.5,
};
const base = config.noctrumApiUrl;
const DAY = 24 * 60 * 60 * 1000;

const loan = (loanId: string, over: Partial<Loan> = {}): Loan => ({
  loanId,
  borrower: "0xborrower",
  token: NUSD,
  principal: "1000",
  collateralToken: NETH,
  collateralAmount: "1",
  maturity: Date.now() + 30 * DAY,
  status: "active",
  ...over,
});

type Call = { url: string; body: string; secrets: string[] };

function mockApi(loans: Loan[] | null, liquidate: (ids: string[]) => { status?: number; json?: unknown } = (ids) => ({
  json: { liquidated: ids.length },
})) {
  const calls: Call[] = [];
  const mock = ConfidentialHttpMock.testInstance();
  mock.sendRequest = (input) => {
    const req = input.request!;
    const body = req.body.case === "bodyString" ? req.body.value : "";
    calls.push({ url: req.url, body, secrets: input.vaultDonSecrets.map((s) => s.namespace + "/" + s.key) });
    let res: { status?: number; json?: unknown };
    if (req.url === base + "/internal/check-loans") res = loans ? { json: { loans } } : { status: 500 };
    else if (req.url === base + "/internal/liquidate-loans") res = liquidate(JSON.parse(body).loanIds);
    else res = { status: 404 };
    return {
      statusCode: res.status ?? 200,
      body: Buffer.from(JSON.stringify(res.json ?? {})).toString("base64"),
    };
  };
  return calls;
}

function mockFeed(price: bigint, decimals = 8) {
  const net = getNetwork({ chainFamily: "evm", chainSelectorName: config.feedChainName, isTestnet: false })!;
  const feed = addContractMock(EvmMock.testInstance(net.chainSelector.selector), {
    address: config.ethUsdFeed as `0x${string}`,
    abi: PriceFeedAggregator,
  });
  let reads = 0;
  feed.decimals = () => {
    reads++;
    return decimals;
  };
  feed.latestAnswer = () => {
    reads++;
    return price;
  };
  return () => reads;
}

function runtime() {
  const rt = newTestRuntime();
  (rt as any).config = config;
  return rt as any;
}

describe("onCronTrigger", () => {
  test("flags matured and undercollateralized loans and liquidates them", () => {
    const loans = [
      loan("healthy", { principal: "1000", collateralAmount: "1" }), // 3000/1000 = 3.0
      loan("matured", { maturity: Date.now() - DAY }),
      loan("under", { principal: "2500", collateralAmount: "1" }), // 3000/2500 = 1.2 < 1.5
      loan("edge", { principal: "2000", collateralAmount: "1" }), // exactly 1.5, not below
    ];
    let liquidatedIds: string[] = [];
    const calls = mockApi(loans, (ids) => {
      liquidatedIds = ids;
      return { json: { liquidated: ids.length } };
    });
    const reads = mockFeed(3000n * 10n ** 8n);
    const rt = runtime();

    expect(onCronTrigger(rt, {} as any)).toBe("checked=4 unhealthy=2 liquidated=2 ethPrice=3000.00");
    expect(liquidatedIds).toEqual(["matured", "under"]);
    expect(reads()).toBe(2);

    expect(calls.map((c) => c.url)).toEqual([base + "/internal/check-loans", base + "/internal/liquidate-loans"]);
    expect(calls[0]!.body).toBe("{}");
    for (const c of calls) expect(c.secrets).toEqual(["noctrum-protocol/INTERNAL_API_KEY"]);

    const logs = rt.getLogs().join("\n");
    expect(logs).toContain("ETH/USD price: 3000 (raw=300000000000 decimals=8)");
    expect(logs).toContain("matured loan=matured");
    expect(logs).toContain("undercollateralized loan=under healthRatio=1.2000 threshold=1.5");
  });

  test("nUSD collateral is still valued at the ETH price (D-3 parity)", () => {
    // 1 nUSD of collateral against 1000 nUSD principal: really 0.001x, but 1 * 3000 / 1000 = 3.0 → healthy
    mockApi([loan("usd-collateral", { collateralToken: NUSD, collateralAmount: "1", principal: "1000" })]);
    mockFeed(3000n * 10n ** 8n);
    expect(onCronTrigger(runtime(), {} as any)).toBe("checked=1 unhealthy=0 liquidated=0 ethPrice=3000.00");
  });

  test("a price drop makes a loan unhealthy", () => {
    mockApi([loan("A", { principal: "1000", collateralAmount: "1" })]);
    mockFeed(1400n * 10n ** 8n); // 1.4 < 1.5
    expect(onCronTrigger(runtime(), {} as any)).toBe("checked=1 unhealthy=1 liquidated=1 ethPrice=1400.00");
  });

  test("skips the ratio check when principal or collateral is zero", () => {
    const calls = mockApi([loan("zero-p", { principal: "0" }), loan("zero-c", { collateralAmount: "0" })]);
    mockFeed(3000n * 10n ** 8n);
    expect(onCronTrigger(runtime(), {} as any)).toBe("checked=2 unhealthy=0 liquidated=0 ethPrice=3000.00");
    expect(calls).toHaveLength(1);
  });

  test("returns the empty summary without reading the feed when there are no loans", () => {
    mockApi([]);
    const reads = mockFeed(3000n * 10n ** 8n);
    expect(onCronTrigger(runtime(), {} as any)).toBe("checked=0 unhealthy=0 undercollateralized=0");
    expect(reads()).toBe(0);
  });

  test("returns error:fetch-loans when loans cannot be fetched", () => {
    mockApi(null);
    expect(onCronTrigger(runtime(), {} as any)).toBe("error:fetch-loans");
  });

  test("a failed liquidation call reports liquidated=0", () => {
    mockApi([loan("matured", { maturity: Date.now() - DAY })], () => ({ status: 500 }));
    mockFeed(3000n * 10n ** 8n);
    const rt = runtime();
    expect(onCronTrigger(rt, {} as any)).toBe("checked=1 unhealthy=1 liquidated=0 ethPrice=3000.00");
    expect(rt.getLogs().join("\n")).toContain("error:liquidate-loans");
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
