import { Bot } from "grammy";
import { ghostGet, fmtEth, tokenSymbol } from "./api";
import { getAddress } from "./wallet";

// Maps userId -> chatId for notifications
const subscribers = new Map<number, number>();
// Track last known state per user to detect changes
const lastBorrowerState = new Map<number, string>();
const lastLenderState = new Map<number, string>();

export function subscribe(userId: number, chatId: number) {
  subscribers.set(userId, chatId);
}

export function unsubscribe(userId: number) {
  subscribers.delete(userId);
  lastBorrowerState.delete(userId);
  lastLenderState.delete(userId);
}

export function isSubscribed(userId: number): boolean {
  return subscribers.has(userId);
}

export function startNotifier(bot: Bot) {
  const POLL_INTERVAL = 15_000; // 15 seconds

  setInterval(async () => {
    for (const [userId, chatId] of subscribers) {
      const address = getAddress(userId);
      if (!address) continue;

      try {
        // Check borrower status for proposals
        const borrowerData = await ghostGet(`/api/v1/borrower-status/${address}`);
        const proposals = borrowerData.pendingProposals ?? [];
        const activeLoans = borrowerData.activeLoans ?? [];

        const borrowerKey = JSON.stringify({
          proposals: proposals.map((p: any) => p.proposalId),
          loans: activeLoans.map((l: any) => l.loanId),
          completedLoans: (borrowerData.completedLoans ?? []).map((l: any) => l.loanId + l.status),
        });

        const prevBorrower = lastBorrowerState.get(userId);
        if (prevBorrower && prevBorrower !== borrowerKey) {
          // Detect new proposals
          const prevData = JSON.parse(prevBorrower);
          const prevProposalIds = new Set(prevData.proposals);
          for (const p of proposals) {
            if (!prevProposalIds.has(p.proposalId)) {
              await bot.api.sendMessage(chatId,
                `\u{1F514} <b>New Match Proposal!</b>\n\n` +
                `\u{1F4B0} Principal: <code>${fmtEth(p.principal)}</code> ${tokenSymbol(p.token)}\n` +
                `\u{1F4C8} Effective Rate: <code>${(p.effectiveRate * 100).toFixed(2)}%</code>\n` +
                `\u{1F512} Collateral: <code>${fmtEth(p.collateralAmount)}</code> ${tokenSymbol(p.collateralToken)}\n` +
                `\u{23F0} Expires: <code>${new Date(p.expiresAt).toISOString()}</code>\n\n` +
                `Use /accept_proposal ${p.proposalId} or /reject_proposal ${p.proposalId}`,
                { parse_mode: "HTML" },
              );
            }
          }

          // Detect newly settled loans
          const prevLoanIds = new Set(prevData.loans);
          for (const loan of activeLoans) {
            if (!prevLoanIds.has(loan.loanId)) {
              await bot.api.sendMessage(chatId,
                `\u{2705} <b>Loan Settled!</b>\n\n` +
                `\u{1F4B0} Principal: <code>${fmtEth(loan.principal)}</code> ${tokenSymbol(loan.token)}\n` +
                `\u{1F4C8} Rate: <code>${(loan.effectiveRate * 100).toFixed(2)}%</code>\n` +
                `\u{1F4C5} Maturity: <code>${loan.maturityDate}</code>\n` +
                `\u{1F4DD} Loan ID: <code>${loan.loanId}</code>`,
                { parse_mode: "HTML" },
              );
            }
          }
        }
        lastBorrowerState.set(userId, borrowerKey);

        // Check lender status
        const lenderData = await ghostGet(`/api/v1/lender-status/${address}`);
        const lenderLoans = lenderData.activeLoans ?? [];
        const completedPayouts = lenderData.completedPayouts ?? [];

        const lenderKey = JSON.stringify({
          loans: lenderLoans.map((l: any) => l.loanId),
          payouts: completedPayouts.map((p: any) => p.id),
        });

        const prevLender = lastLenderState.get(userId);
        if (prevLender && prevLender !== lenderKey) {
          const prevData = JSON.parse(prevLender);
          const prevLoanIds = new Set(prevData.loans);
          for (const loan of lenderLoans) {
            if (!prevLoanIds.has(loan.loanId)) {
              await bot.api.sendMessage(chatId,
                `\u{1F4B8} <b>Your Lend Got Matched!</b>\n\n` +
                `\u{1F4B0} Amount: <code>${fmtEth(loan.principal)}</code> ${tokenSymbol(loan.token)}\n` +
                `\u{1F4C8} Rate: <code>${(loan.rate * 100).toFixed(2)}%</code>\n` +
                `\u{1F4C5} Maturity: <code>${loan.maturityDate}</code>\n` +
                `\u{1F4DD} Expected Payout: <code>${fmtEth(loan.expectedPayout)}</code> ${tokenSymbol(loan.token)}`,
                { parse_mode: "HTML" },
              );
            }
          }

          // Detect completed payouts
          const prevPayoutIds = new Set(prevData.payouts);
          for (const payout of completedPayouts) {
            if (!prevPayoutIds.has(payout.id)) {
              await bot.api.sendMessage(chatId,
                `\u{1F389} <b>Payout Received!</b>\n\n` +
                `\u{1F4B0} Amount: <code>${fmtEth(payout.amount)}</code> ${tokenSymbol(payout.token)}\n` +
                `\u{1F4CB} Reason: <code>${payout.reason}</code>`,
                { parse_mode: "HTML" },
              );
            }
          }
        }
        lastLenderState.set(userId, lenderKey);
      } catch {
        // Silent — server might be down
      }
    }
  }, POLL_INTERVAL);
}
