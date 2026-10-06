"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Loader2, AlertCircle } from "lucide-react";
import {
  CHAIN_ID,
  GHOST_DOMAIN,
  CANCEL_BORROW_TYPES,
  CANCEL_LEND_TYPES,
  CLAIM_EXCESS_COLLATERAL_TYPES,
  REPAY_LOAN_TYPES,
  gUSD,
  gETH,
} from "@/lib/constants";
import { get, post, ts } from "@/lib/ghost";

interface BorrowIntent {
  intentId: string;
  token: string;
  amount: string;
  collateralToken: string;
  collateralAmount: string;
  status: string;
  createdAt: number;
}

interface LendIntent {
  intentId: string;
  slotId: string;
  token: string;
  amount: string;
  createdAt: number;
}

interface ActiveLoan {
  loanId: string;
  token: string;
  principal: string;
  effectiveRate?: number;
  rate?: number;
  totalDue?: string;
  repaidAmount?: string;
  collateralToken?: string;
  collateralAmount?: string;
  requiredCollateral?: string;
  excessCollateral?: string;
  maturityDate?: string;
  expectedPayout?: string;
  maturity?: number;
  borrower?: string;
}

const formatAmount = (wei: string) => {
  const num = Number(wei) / 1e18;
  return num.toLocaleString(undefined, { maximumFractionDigits: 5 });
};

const tokenSymbol = (addr?: string) => {
  if (!addr) return "gUSD";
  const lower = addr.toLowerCase();
  if (lower === gUSD.toLowerCase()) return "gUSD";
  if (lower === gETH.toLowerCase()) return "gETH";
  return addr.slice(0, 6) + "...";
};

const tokenLogo = (addr?: string) => {
  if (addr && addr.toLowerCase() === gETH.toLowerCase()) return "/geth.png";
  return "/gusd.png";
};

function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const e = err as any;
  const code = e?.code ?? e?.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001)
    return "Transaction rejected";
  const msg =
    e?.shortMessage ?? e?.reason ?? e?.message ?? "Something went wrong";
  return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
}

const StatusTab = () => {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [borrowIntents, setBorrowIntents] = useState<BorrowIntent[]>([]);
  const [lendIntents, setLendIntents] = useState<LendIntent[]>([]);
  const [borrowLoans, setBorrowLoans] = useState<ActiveLoan[]>([]);
  const [lendLoans, setLendLoans] = useState<ActiveLoan[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [repaying, setRepaying] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const [borrowData, lendData] = await Promise.all([
        get(`/api/v1/borrower-status/${walletAddress}`),
        get(`/api/v1/lender-status/${walletAddress}`),
      ]);
      setBorrowIntents(borrowData.pendingIntents ?? []);
      setBorrowLoans(borrowData.activeLoans ?? []);
      setLendIntents(lendData.activeLends ?? []);
      setLendLoans(lendData.activeLoans ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleCancelBorrow = async (intentId: string) => {
    const wallet = wallets[0];
    if (!wallet) return;

    setCancelling(intentId);
    setError("");
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const timestamp = ts();

      const message = { account, intentId, timestamp };
      const auth = await signer.signTypedData(
        GHOST_DOMAIN,
        CANCEL_BORROW_TYPES,
        message,
      );
      await post("/api/v1/cancel-borrow", { ...message, auth });
      await loadStatus();
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setCancelling(null);
    }
  };

  const handleCancelLend = async (slotId: string) => {
    const wallet = wallets[0];
    if (!wallet) return;

    setCancelling(slotId);
    setError("");
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const timestamp = ts();

      const message = { account, slotId, timestamp };
      const auth = await signer.signTypedData(
        GHOST_DOMAIN,
        CANCEL_LEND_TYPES,
        message,
      );
      await post("/api/v1/cancel-lend", { ...message, auth });
      await loadStatus();
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setCancelling(null);
    }
  };

  const handleClaimExcess = async (loanId: string) => {
    const wallet = wallets[0];
    if (!wallet) return;

    setCancelling(`claim-${loanId}`);
    setError("");
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const timestamp = ts();

      const message = { account, loanId, timestamp };
      const auth = await signer.signTypedData(
        GHOST_DOMAIN,
        CLAIM_EXCESS_COLLATERAL_TYPES,
        message,
      );
      await post("/api/v1/claim-excess-collateral", { ...message, auth });
      await loadStatus();
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setCancelling(null);
    }
  };

  const handleRepay = async (loan: ActiveLoan) => {
    const wallet = wallets[0];
    if (!wallet || !loan.totalDue) return;

    setRepaying(loan.loanId);
    setError("");
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const timestamp = ts();

      const message = { account, loanId: loan.loanId, amount: loan.totalDue, timestamp };
      const auth = await signer.signTypedData(
        GHOST_DOMAIN,
        REPAY_LOAN_TYPES,
        message,
      );
      await post("/api/v1/repay", { ...message, auth });
      await loadStatus();
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setRepaying(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="space-y-6">
        <button
          onClick={login}
          className="w-full text-gray-900 font-medium py-4 rounded-2xl transition-colors cursor-pointer text-lg"
          style={{ backgroundColor: "#e2a9f1" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  const isEmpty =
    borrowIntents.length === 0 &&
    lendIntents.length === 0 &&
    borrowLoans.length === 0 &&
    lendLoans.length === 0;

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl bg-red-500/10 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {isEmpty && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
          No active intents or loans found.
        </div>
      )}

      {/* Borrow Intents */}
      {borrowIntents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">
            Borrow Intents
          </h2>
          <div className="space-y-2">
            {borrowIntents.map((intent) => (
              <div
                key={intent.intentId}
                className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <img src={tokenLogo(intent.token)} alt={tokenSymbol(intent.token)} className="w-8 h-8 rounded-full" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {formatAmount(intent.amount)} {tokenSymbol(intent.token)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Collateral: {formatAmount(intent.collateralAmount)}{" "}
                      {tokenSymbol(intent.collateralToken)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      intent.status === "proposed"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    {intent.status}
                  </span>
                  {intent.status === "pending" && (
                    <button
                      onClick={() => handleCancelBorrow(intent.intentId)}
                      disabled={cancelling === intent.intentId}
                      className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer disabled:opacity-50"
                    >
                      {cancelling === intent.intentId
                        ? "Cancelling..."
                        : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lend Intents */}
      {lendIntents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">Lend Intents</h2>
          <div className="space-y-2">
            {lendIntents.map((intent) => (
              <div
                key={intent.intentId}
                className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <img src={tokenLogo(intent.token)} alt={tokenSymbol(intent.token)} className="w-8 h-8 rounded-full" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {formatAmount(intent.amount)} {tokenSymbol(intent.token)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {intent.intentId.slice(0, 10)}...
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/20 text-green-400">
                    active
                  </span>
                  <button
                    onClick={() => handleCancelLend(intent.slotId)}
                    disabled={cancelling === intent.slotId}
                    className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer disabled:opacity-50"
                  >
                    {cancelling === intent.slotId ? "Cancelling..." : "Cancel"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Borrow Loans */}
      {borrowLoans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">
            Active Loans (Borrowing)
          </h2>
          <div className="space-y-2">
            {borrowLoans.map((loan) => (
              <div
                key={loan.loanId}
                className="bg-card border border-border rounded-xl px-4 py-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={tokenLogo(loan.token)} alt={tokenSymbol(loan.token)} className="w-8 h-8 rounded-full" />
                    <div className="text-sm font-medium text-foreground">
                      {formatAmount(loan.principal)} {tokenSymbol(loan.token)}
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-400">
                    active
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    Rate:{" "}
                    <span className="text-foreground">
                      {((loan.effectiveRate ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div>
                    Due:{" "}
                    <span className="text-foreground">
                      {loan.totalDue ? formatAmount(loan.totalDue) : "—"}{" "}
                      {tokenSymbol(loan.token)}
                    </span>
                  </div>
                  <div>
                    Repaid:{" "}
                    <span className="text-foreground">
                      {loan.repaidAmount
                        ? formatAmount(loan.repaidAmount)
                        : "0"}
                    </span>
                  </div>
                  <div>
                    Maturity:{" "}
                    <span className="text-foreground">
                      {loan.maturityDate
                        ? new Date(loan.maturityDate).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                  {loan.collateralToken && (
                    <div>
                      Collateral:{" "}
                      <span className="text-foreground">
                        {loan.collateralAmount
                          ? formatAmount(loan.collateralAmount)
                          : "0"}{" "}
                        {tokenSymbol(loan.collateralToken)}
                      </span>
                    </div>
                  )}
                  {loan.excessCollateral &&
                    Number(loan.excessCollateral) > 0 && (
                      <div>
                        Excess:{" "}
                        <span className="text-emerald-400">
                          {formatAmount(loan.excessCollateral)}{" "}
                          {tokenSymbol(loan.collateralToken!)}
                        </span>
                      </div>
                    )}
                </div>
                {loan.excessCollateral && Number(loan.excessCollateral) > 0 && (
                  <button
                    onClick={() => handleClaimExcess(loan.loanId)}
                    disabled={cancelling === `claim-${loan.loanId}`}
                    className="w-full mt-1 bg-new-pink disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 text-sm font-medium py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    {cancelling === `claim-${loan.loanId}`
                      ? "Withdrawing..."
                      : `Withdraw (${formatAmount(loan.excessCollateral)} ${tokenSymbol(loan.collateralToken!)})`}
                  </button>
                )}
                <button
                  onClick={() => handleRepay(loan)}
                  disabled={repaying === loan.loanId}
                  className="w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 text-sm font-medium py-2 rounded-lg transition-colors cursor-pointer"
                  style={{ backgroundColor: "#e2a9f1" }}
                >
                  {repaying === loan.loanId
                    ? "Repaying..."
                    : `Repay (${loan.totalDue ? formatAmount(loan.totalDue) : "—"} ${tokenSymbol(loan.token)})`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Lend Loans */}
      {lendLoans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">
            Active Loans (Lending)
          </h2>
          <div className="space-y-2">
            {lendLoans.map((loan) => (
              <div
                key={loan.loanId}
                className="bg-card border border-border rounded-xl px-4 py-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={tokenLogo(loan.token)} alt={tokenSymbol(loan.token)} className="w-8 h-8 rounded-full" />
                    <div className="text-sm font-medium text-foreground">
                      {formatAmount(loan.principal)} {tokenSymbol(loan.token)}
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-400">
                    active
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    Rate:{" "}
                    <span className="text-foreground">
                      {(
                        (loan.effectiveRate ?? (loan as any).rate ?? 0) * 100
                      ).toFixed(2)}
                      %
                    </span>
                  </div>
                  <div>
                    Payout:{" "}
                    <span className="text-foreground">
                      {loan.expectedPayout
                        ? formatAmount(loan.expectedPayout)
                        : "—"}{" "}
                      {tokenSymbol(loan.token)}
                    </span>
                  </div>
                  <div>
                    Maturity:{" "}
                    <span className="text-foreground">
                      {loan.maturityDate
                        ? new Date(loan.maturityDate).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusTab;
