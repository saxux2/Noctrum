import {
  type CronPayload,
  cre,
  Runner,
  type Runtime,
  ok,
  json,
} from "@chainlink/cre-sdk";

import { runMatchingEngine, type LendIntent, type BorrowIntent } from "./matching";

// ── Config ──────────────────────────────────────────

export type Config = {
  schedule: string;
  noctrumApiUrl: string;
};

// ── Vault DON secret config ─────────────────────────

const API_KEY_SECRET = [{ key: "INTERNAL_API_KEY", namespace: "noctrum-protocol" }];

// ── CRE handler ─────────────────────────────────────

export const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("settle-loans triggered");

  const confClient = new cre.capabilities.ConfidentialHTTPClient();
  const base = runtime.config.noctrumApiUrl;

  // Get CRE private key for rate decryption
  let crePrivateKey: string | undefined;
  try {
    crePrivateKey = runtime.getSecret({ id: "CRE_PRIVATE_KEY" }).result().value;
  } catch (_) {
    runtime.log("CRE_PRIVATE_KEY not available, using plaintext/default rates");
  }

  // Step 1: Expire timed-out proposals
  confClient.sendRequest(runtime, {
    vaultDonSecrets: API_KEY_SECRET,
    request: {
      url: base + "/internal/expire-proposals",
      method: "POST",
      multiHeaders: {
        "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
        "content-type": { values: ["application/json"] },
      },
      bodyString: "{}",
    },
  }).result();

  // Step 2: Fetch pending intents
  const getResp = confClient.sendRequest(runtime, {
    vaultDonSecrets: API_KEY_SECRET,
    request: {
      url: base + "/internal/pending-intents",
      method: "GET",
      multiHeaders: {
        "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
      },
    },
  }).result();

  if (!ok(getResp)) return "error:fetch-intents";

  const data = json(getResp) as { lendIntents: LendIntent[]; borrowIntents: BorrowIntent[] };
  const lendIntents = data.lendIntents ?? [];
  const borrowIntents = data.borrowIntents ?? [];

  if (lendIntents.length === 0 || borrowIntents.length === 0) return "no-match";

  // Step 3: Run matching engine
  const proposals = runMatchingEngine(lendIntents, borrowIntents, crePrivateKey);
  if (proposals.length === 0) return "no-proposals";

  // Step 4: Post proposals
  const postResp = confClient.sendRequest(runtime, {
    vaultDonSecrets: API_KEY_SECRET,
    request: {
      url: base + "/internal/record-match-proposals",
      method: "POST",
      multiHeaders: {
        "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
        "content-type": { values: ["application/json"] },
      },
      bodyString: JSON.stringify({ proposals }),
    },
  }).result();

  if (!ok(postResp)) return "error:record-proposals";

  const postData = json(postResp) as any;
  const result = "matched:" + proposals.length + " recorded:" + (postData.recorded ?? 0);
  runtime.log("settle-loans result: " + result);
  return result;
};

// ── Workflow init ───────────────────────────────────

export const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
