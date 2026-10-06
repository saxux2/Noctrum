import {
  type CronPayload,
  cre,
  Runner,
  type Runtime,
  ok,
  json,
} from "@chainlink/cre-sdk";

import { decrypt } from "eciesjs";

// ── Config ──────────────────────────────────────────

export type Config = {
  schedule: string;
  ghostApiUrl: string;
};

// ── Types ───────────────────────────────────────────

interface LendIntent {
  intentId: string;
  userId: string;
  token: string;
  amount: string;
  encryptedRate: string;
}

interface BorrowIntent {
  intentId: string;
  borrower: string;
  token: string;
  amount: string;
  encryptedMaxRate: string;
  collateralToken: string;
  collateralAmount: string;
  status: string;
}

interface MatchedTick {
  lender: string;
  lendIntentId: string;
  amount: string;
  rate: number;
}

interface Proposal {
  proposalId: string;
  borrowIntentId: string;
  borrower: string;
  token: string;
  principal: string;
  matchedTicks: MatchedTick[];
  effectiveBorrowerRate: number;
  collateralToken: string;
  collateralAmount: string;
}

// ── Rate decryption ─────────────────────────────────

function decryptRate(encryptedRate: string, privateKeyHex?: string): number {
  // Try plaintext first (test mode)
  const parsed = Number(encryptedRate);
  if (!isNaN(parsed) && parsed > 0 && parsed < 1) return parsed;

  // Try ECIES decryption
  if (privateKeyHex) {
    try {
      const encrypted = Buffer.from(encryptedRate, "hex");
      const decrypted = decrypt(privateKeyHex, encrypted);
      const rate = Number(new TextDecoder().decode(decrypted));
      if (!isNaN(rate) && rate > 0 && rate < 1) return rate;
    } catch (_) {
      // decryption failed, fall through
    }
  }

  return 0.05;
}

// ── Matching engine ─────────────────────────────────

function runMatchingEngine(
  lendIntents: LendIntent[],
  borrowIntents: BorrowIntent[],
  privateKeyHex?: string,
): Proposal[] {
  const lends = lendIntents.map((l) => ({
    intentId: l.intentId,
    userId: l.userId,
    token: l.token,
    amount: Number(l.amount),
    rate: decryptRate(l.encryptedRate, privateKeyHex),
  }));

  const borrows = borrowIntents.map((b) => ({
    intentId: b.intentId,
    borrower: b.borrower,
    token: b.token,
    amount: Number(b.amount),
    maxRate: decryptRate(b.encryptedMaxRate, privateKeyHex),
    collateralToken: b.collateralToken,
    collateralAmount: b.collateralAmount,
  }));

  // Sort borrows largest-K-first, lends cheapest-rate-first
  borrows.sort((a, b) => b.amount - a.amount);
  lends.sort((a, b) => a.rate - b.rate);

  const remaining = new Map<string, number>();
  for (const l of lends) remaining.set(l.intentId, l.amount);

  const proposals: Proposal[] = [];

  for (const borrow of borrows) {
    let filled = 0;
    let weightedRateSum = 0;
    const ticks: MatchedTick[] = [];

    for (const lend of lends) {
      if (filled >= borrow.amount) break;
      if (lend.token !== borrow.token) continue;
      const avail = remaining.get(lend.intentId) ?? 0;
      if (avail <= 0) continue;

      const take = Math.min(avail, borrow.amount - filled);
      ticks.push({
        lender: lend.userId,
        lendIntentId: lend.intentId,
        amount: String(take),
        rate: lend.rate,
      });
      weightedRateSum += take * lend.rate;
      filled += take;
      remaining.set(lend.intentId, avail - take);
    }

    if (filled <= 0) continue;

    const blendedRate = weightedRateSum / filled;

    if (blendedRate > borrow.maxRate) {
      for (const t of ticks) {
        const prev = remaining.get(t.lendIntentId) ?? 0;
        remaining.set(t.lendIntentId, prev + Number(t.amount));
      }
      continue;
    }

    proposals.push({
      proposalId: "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      borrowIntentId: borrow.intentId,
      borrower: borrow.borrower,
      token: borrow.token,
      principal: String(filled),
      matchedTicks: ticks,
      effectiveBorrowerRate: blendedRate,
      collateralToken: borrow.collateralToken,
      collateralAmount: borrow.collateralAmount,
    });
  }

  return proposals;
}

// ── Vault DON secret config ─────────────────────────

const API_KEY_SECRET = [{ key: "INTERNAL_API_KEY", namespace: "ghost-protocol" }];

// ── CRE handler ─────────────────────────────────────

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("settle-loans triggered");

  const confClient = new cre.capabilities.ConfidentialHTTPClient();
  const base = runtime.config.ghostApiUrl;

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

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
