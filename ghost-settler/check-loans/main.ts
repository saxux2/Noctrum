import {
  type CronPayload,
  cre,
  Runner,
  type Runtime,
  ok,
  json,
  bytesToHex,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  formatUnits,
  zeroAddress,
  type Address,
} from "viem";
import { PriceFeedAggregator } from "../contracts/abi";

export type Config = {
  schedule: string;
  ghostApiUrl: string;
  feedChainName: string;
  ethUsdFeed: string;
  liquidationThreshold: number;
};

interface Loan {
  loanId: string;
  borrower: string;
  token: string;
  principal: string;
  collateralToken: string;
  collateralAmount: string;
  maturity: number;
  status: string;
}

const API_KEY_SECRET = [{ key: "INTERNAL_API_KEY", namespace: "ghost-protocol" }];

// ── Price feed reader ───────────────────────────────

function readEthPrice(runtime: Runtime<Config>): number {
  const net = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.feedChainName,
    isTestnet: false,
  });
  if (!net) throw new Error(`Network not found: ${runtime.config.feedChainName}`);

  const evmClient = new cre.capabilities.EVMClient(net.chainSelector.selector);
  const feedAddr = runtime.config.ethUsdFeed as Address;

  // decimals()
  const decData = encodeFunctionData({
    abi: PriceFeedAggregator,
    functionName: "decimals",
  });
  const decResp = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: feedAddr, data: decData }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const decimals = decodeFunctionResult({
    abi: PriceFeedAggregator,
    functionName: "decimals",
    data: bytesToHex(decResp.data),
  }) as number;

  // latestAnswer()
  const ansData = encodeFunctionData({
    abi: PriceFeedAggregator,
    functionName: "latestAnswer",
  });
  const ansResp = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: feedAddr, data: ansData }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const latestAnswer = decodeFunctionResult({
    abi: PriceFeedAggregator,
    functionName: "latestAnswer",
    data: bytesToHex(ansResp.data),
  }) as bigint;

  const scaled = formatUnits(latestAnswer, decimals);
  runtime.log(`ETH/USD price: ${scaled} (raw=${latestAnswer.toString()} decimals=${decimals})`);
  return parseFloat(scaled);
}

// ── CRE handler ─────────────────────────────────────

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("check-loans triggered");

  // Fetch active loans from Ghost API
  const confClient = new cre.capabilities.ConfidentialHTTPClient();
  const base = runtime.config.ghostApiUrl;

  const resp = confClient.sendRequest(runtime, {
    vaultDonSecrets: API_KEY_SECRET,
    request: {
      url: base + "/internal/check-loans",
      method: "POST",
      multiHeaders: {
        "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
        "content-type": { values: ["application/json"] },
      },
      bodyString: "{}",
    },
  }).result();

  if (!ok(resp)) return "error:fetch-loans";

  const data = json(resp) as { loans: Loan[] };
  const loans = data.loans ?? [];

  if (loans.length === 0) return "checked=0 unhealthy=0 undercollateralized=0";

  // Read ETH/USD price from Chainlink on Arbitrum
  const ethPrice = readEthPrice(runtime);

  const now = Date.now();
  const unhealthyIds: string[] = [];

  for (const loan of loans) {
    // Maturity check
    if (loan.maturity < now) {
      unhealthyIds.push(loan.loanId);
      runtime.log(`matured loan=${loan.loanId}`);
      continue;
    }

    // Collateral health ratio: (collateralAmount * ethPrice) / principal
    const collateral = parseFloat(loan.collateralAmount);
    const principal = parseFloat(loan.principal);

    if (principal > 0 && collateral > 0) {
      const healthRatio = (collateral * ethPrice) / principal;
      if (healthRatio < runtime.config.liquidationThreshold) {
        unhealthyIds.push(loan.loanId);
        runtime.log(
          `undercollateralized loan=${loan.loanId} healthRatio=${healthRatio.toFixed(4)} threshold=${runtime.config.liquidationThreshold}`
        );
      }
    }
  }

  // Liquidate unhealthy loans
  let liquidated = 0;
  if (unhealthyIds.length > 0) {
    const liqResp = confClient.sendRequest(runtime, {
      vaultDonSecrets: API_KEY_SECRET,
      request: {
        url: base + "/internal/liquidate-loans",
        method: "POST",
        multiHeaders: {
          "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
          "content-type": { values: ["application/json"] },
        },
        bodyString: JSON.stringify({ loanIds: unhealthyIds }),
      },
    }).result();

    if (ok(liqResp)) {
      const liqData = json(liqResp) as { liquidated: number };
      liquidated = liqData.liquidated ?? 0;
      runtime.log(`liquidated ${liquidated} loans`);
    } else {
      runtime.log("error:liquidate-loans");
    }
  }

  const result = `checked=${loans.length} unhealthy=${unhealthyIds.length} liquidated=${liquidated} ethPrice=${ethPrice.toFixed(2)}`;
  runtime.log("check-loans result: " + result);
  return result;
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
