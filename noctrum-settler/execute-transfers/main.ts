import {
  type CronPayload,
  cre,
  Runner,
  type Runtime,
  ok,
  json,
} from "@chainlink/cre-sdk";

import { privateKeyToAccount } from "viem/accounts";
import { getDomain, TRANSFER_TYPES } from "./eip712";

// ── Config ──────────────────────────────────────────

export type Config = {
  schedule: string;
  noctrumApiUrl: string;
  externalApiUrl: string;
  vaultAddress: string;
  chainId: number;
};

// ── Types ───────────────────────────────────────────

export interface PendingTransfer {
  id: string;
  recipient: string;
  token: string;
  amount: string;
  reason: string;
}

// ── Vault DON secret config ─────────────────────────

const API_KEY_SECRET = [{ key: "INTERNAL_API_KEY", namespace: "noctrum-protocol" }];

// ── CRE handler ─────────────────────────────────────

export const onCronTrigger = async (runtime: Runtime<Config>, _payload: CronPayload): Promise<string> => {
  runtime.log("execute-transfers triggered");

  const confClient = new cre.capabilities.ConfidentialHTTPClient();
  const base = runtime.config.noctrumApiUrl;

  // 1. Poll for pending transfers
  const pendingResp = confClient.sendRequest(runtime, {
    vaultDonSecrets: API_KEY_SECRET,
    request: {
      url: base + "/internal/pending-transfers",
      method: "GET",
      multiHeaders: {
        "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
      },
    },
  }).result();

  if (!ok(pendingResp)) return "error:fetch-pending";

  const data = json(pendingResp) as { transfers: PendingTransfer[] };
  const allTransfers = data.transfers ?? [];
  if (allTransfers.length === 0) return "no-pending";

  // CRE limits confidential HTTP calls to 5 per execution.
  // Budget: 1 (fetch) + N (transfers) + 1 (confirm) = N+2, so max N=3
  const transfers = allTransfers.slice(0, 3);

  // 2. Get pool private key from vault for signing
  const poolKeyResult = runtime.getSecret({ id: "POOL_PRIVATE_KEY" }).result();
  const poolPrivateKey = poolKeyResult.value;
  if (!poolPrivateKey) return "error:no-pool-key";

  const account = privateKeyToAccount(
    (poolPrivateKey.startsWith("0x") ? poolPrivateKey : `0x${poolPrivateKey}`) as `0x${string}`,
  );

  const domain = getDomain(runtime.config);
  const executedIds: string[] = [];
  const failedIds: string[] = [];

  // 3. Execute each transfer directly via external API
  for (const transfer of transfers) {
    try {
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      const message = {
        sender: account.address,
        recipient: transfer.recipient as `0x${string}`,
        token: transfer.token as `0x${string}`,
        amount: BigInt(transfer.amount),
        flags: [] as string[],
        timestamp,
      };

      const auth = await account.signTypedData({
        domain,
        types: TRANSFER_TYPES,
        primaryType: "Private Token Transfer",
        message,
      });

      const body = JSON.stringify({
        account: account.address,
        recipient: transfer.recipient,
        token: transfer.token,
        amount: transfer.amount,
        flags: [],
        timestamp: Number(timestamp),
        auth,
      });

      const execResp = confClient.sendRequest(runtime, {
        vaultDonSecrets: [],
        request: {
          url: runtime.config.externalApiUrl + "/private-transfer",
          method: "POST",
          multiHeaders: {
            "content-type": { values: ["application/json"] },
          },
          bodyString: body,
        },
      }).result();

      if (ok(execResp)) {
        executedIds.push(transfer.id);
      } else {
        failedIds.push(transfer.id);
      }
    } catch (_) {
      failedIds.push(transfer.id);
    }
  }

  if (executedIds.length === 0) return "error:all-failed";

  // 4. Confirm completed transfers on noctrum server
  const confirmResp = confClient.sendRequest(runtime, {
    vaultDonSecrets: API_KEY_SECRET,
    request: {
      url: base + "/internal/confirm-transfers",
      method: "POST",
      multiHeaders: {
        "x-api-key": { values: ["{{.INTERNAL_API_KEY}}"] },
        "content-type": { values: ["application/json"] },
      },
      bodyString: JSON.stringify({ transferIds: executedIds }),
    },
  }).result();

  if (!ok(confirmResp)) return "error:confirm-failed executed=" + executedIds.length;

  const result = "executed=" + executedIds.length + " failed=" + failedIds.length;
  runtime.log("execute-transfers result: " + result);
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
