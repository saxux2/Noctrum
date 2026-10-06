"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import CoinSelector from "./CoinSelector";
import {
  COINS,
  CHAIN_ID,
  VAULT_ADDRESS,
  ERC20_ABI,
  VAULT_ABI,
  GHOST_DOMAIN,
  BORROW_TYPES,
  CANCEL_BORROW_TYPES,
  fetchPoolAddress,
  gUSD,
  gETH,
  type Coin,
} from "@/lib/constants";
import { encryptRate, get, post, privateTransfer, toWei, ts } from "@/lib/ghost";
import { RollingNumber, RollingText } from "@/components/ui/rolling-text";

type Status = "idle" | "approving" | "depositing" | "transferring" | "submitting" | "done" | "error";

const STATUS_LABELS: Record<Status, string> = {
  idle: "",
  approving: "Approving token spend...",
  depositing: "Depositing collateral into vault...",
  transferring: "Private transferring collateral to pool...",
  submitting: "Submitting borrow intent...",
  done: "Borrow intent submitted!",
  error: "Something went wrong",
};

interface BorrowIntent {
  intentId: string;
  token: string;
  amount: string;
  collateralToken: string;
  collateralAmount: string;
  status: string;
  createdAt: number;
}

const formatAmount = (wei: string) => {
  const num = Number(wei) / 1e18;
  return num.toLocaleString(undefined, { maximumFractionDigits: 5 });
};

const tokenSymbol = (addr: string) => {
  const lower = addr.toLowerCase();
  if (lower === gUSD.toLowerCase()) return "gUSD";
  if (lower === gETH.toLowerCase()) return "gETH";
  return addr.slice(0, 6) + "...";
};

function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const e = err as any;
  const code = e?.code ?? e?.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return "Transaction rejected";
  if (e?.code === "INSUFFICIENT_FUNDS") return "Insufficient funds";
  const msg = e?.shortMessage ?? e?.reason ?? e?.message ?? "Something went wrong";
  return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
}

const AnimatedInput = ({
  value,
  onChange,
  onKeyDown,
  placeholder,
  readOnly,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  readOnly?: boolean;
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className="w-full relative">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`bg-transparent text-3xl font-medium outline-none w-full placeholder:text-muted-foreground/60 ${
          value && !focused ? "text-transparent caret-transparent" : "text-foreground"
        }`}
      />
      {value && !focused && (
        <div className="absolute inset-0 flex items-center pointer-events-none text-3xl font-medium text-foreground">
          <RollingNumber value={value} />
        </div>
      )}
    </div>
  );
};

const BorrowCard = () => {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [borrowAmount, setBorrowAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [duration, setDuration] = useState("30");
  const [borrowCoin, setBorrowCoin] = useState(COINS[0]); // gUSD
  const [collateralCoin, setCollateralCoin] = useState(COINS[1]); // gETH
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteMeta, setQuoteMeta] = useState<{ tier: string; multiplier: number; ethPrice: number | null } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blockInvalidChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
  };

  const handleNumericChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d*$/.test(val)) setter(val);
  };

  const handleIntChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d+$/.test(val)) setter(val);
  };

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [intentId, setIntentId] = useState("");
  const [intents, setIntents] = useState<BorrowIntent[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const walletAddress = wallets[0]?.address;

  const loadIntents = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const data: any = await get(`/api/v1/borrower-status/${walletAddress}`);
      setIntents(data.pendingIntents ?? []);
    } catch {
      // silent
    }
  }, [walletAddress]);

  useEffect(() => {
    loadIntents();
  }, [loadIntents]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const parsed = parseFloat(borrowAmount);
    if (!borrowAmount || !parsed || parsed <= 0) {
      setCollateralAmount("");
      setQuoteMeta(null);
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const amountWei = toWei(parsed * 1.02);
        const params = new URLSearchParams({
          account: walletAddress || "0x0000000000000000000000000000000000000000",
          token: borrowCoin.address,
          amount: amountWei,
          collateralToken: collateralCoin.address,
        });
        const data = await get(`/api/v1/collateral-quote?${params}`);
        if (data.error) throw new Error(data.error);
        const requiredWei = BigInt(data.requiredCollateral);
        const formatted = parseFloat(ethers.formatEther(requiredWei)).toFixed(5);
        setCollateralAmount(formatted);
        setQuoteMeta({ tier: data.tier, multiplier: data.multiplier, ethPrice: data.ethPrice });
      } catch {
        // silently fail, user can still enter manually
      } finally {
        setQuoteLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [borrowAmount, borrowCoin.address, collateralCoin.address, walletAddress]);

  const handleBorrowCoinChange = (coin: Coin) => {
    setBorrowCoin(coin);
    setCollateralCoin(coin.symbol === "gUSD" ? COINS[1] : COINS[0]);
  };

  const validateInputs = (): string | null => {
    const amt = parseFloat(borrowAmount);
    if (!amt || amt <= 0) return "Enter a valid borrow amount";

    const col = parseFloat(collateralAmount);
    if (!col || col <= 0) return "Enter a valid collateral amount";

    const rate = parseFloat(maxRate);
    if (isNaN(rate) || rate <= 0 || rate > 100) return "Rate must be between 0 and 100%";

    const dur = parseInt(duration);
    if (!dur || dur <= 0) return "Enter a valid duration";

    return null;
  };

  const handleBorrow = async () => {
    if (!authenticated) {
      login();
      return;
    }

    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      setError("No wallet connected");
      setStatus("error");
      return;
    }

    try {
      setError("");
      setIntentId("");

      // Ensure wallet is on Sepolia
      await wallet.switchChain(CHAIN_ID);

      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();

      const borrowAmtWei = toWei(parseFloat(borrowAmount));
      const collateralAmtWei = toWei(parseFloat(collateralAmount));
      const rateDecimal = (parseFloat(maxRate) / 100).toFixed(2);

      // Step 1: Approve collateral token to vault
      setStatus("approving");
      const token = new ethers.Contract(collateralCoin.address, ERC20_ABI, signer);
      const approveTx = await token.approve(VAULT_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();

      // Step 2: Deposit collateral into vault
      setStatus("depositing");
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const depositTx = await vault.deposit(collateralCoin.address, collateralAmtWei);
      await depositTx.wait();

      // Step 3: Private transfer collateral to pool
      setStatus("transferring");
      const poolAddr = await fetchPoolAddress();
      await privateTransfer(signer, poolAddr, collateralCoin.address, collateralAmtWei);

      // Step 4: Submit borrow intent
      setStatus("submitting");
      const encrypted = encryptRate(rateDecimal);
      const timestamp = ts();

      const borrowMsg = {
        account,
        token: borrowCoin.address,
        amount: borrowAmtWei,
        collateralToken: collateralCoin.address,
        collateralAmount: collateralAmtWei,
        encryptedMaxRate: encrypted,
        timestamp,
      };

      const auth = await signer.signTypedData(GHOST_DOMAIN, BORROW_TYPES, borrowMsg);
      const result = await post("/api/v1/borrow-intent", { ...borrowMsg, auth });

      setIntentId(result.intentId);
      setStatus("done");
      setBorrowAmount("");
      setMaxRate("");
      setCollateralAmount("");
      await loadIntents();
    } catch (err: unknown) {
      setError(friendlyError(err));
      setStatus("error");
    }
  };

  const handleCancel = async (intentIdToCancel: string) => {
    const wallet = wallets[0];
    if (!wallet) return;

    setCancelling(intentIdToCancel);
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const timestamp = ts();

      const message = { account, intentId: intentIdToCancel, timestamp };
      const auth = await signer.signTypedData(GHOST_DOMAIN, CANCEL_BORROW_TYPES, message);
      await post("/api/v1/cancel-borrow", { ...message, auth });
      await loadIntents();
    } catch (err: unknown) {
      setError(friendlyError(err));
      setStatus("error");
    } finally {
      setCancelling(null);
    }
  };

  const isProcessing = ["approving", "depositing", "transferring", "submitting"].includes(status);
  const rateEmpty = !maxRate || maxRate.trim() === "";
  const hasAmountAndDuration = parseFloat(borrowAmount) > 0 && parseInt(duration) > 0;

  return (
    <>
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      {/* Borrow Token & Amount */}
      <div className="space-y-2">
        <div className="bg-muted/50 rounded-xl px-5 py-4">
          <div className="text-sm text-muted-foreground mb-3">
            You&apos;re borrowing
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              inputMode="decimal"
              value={borrowAmount}
              onChange={handleNumericChange(setBorrowAmount)}
              onKeyDown={blockInvalidChars}
              placeholder="0"
              className="bg-transparent text-3xl font-medium text-foreground outline-none w-full placeholder:text-muted-foreground/60"
            />
            <div className="shrink-0 w-36">
              <CoinSelector
                coins={[...COINS]}
                selected={borrowCoin}
                onSelect={handleBorrowCoinChange}
                label=""
              />
            </div>
          </div>
        </div>

        {/* Collateral Amount */}
        <div className="bg-muted/50 rounded-xl px-5 py-4">
          <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
            Collateral ({collateralCoin.symbol})
            {quoteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
          </div>
          <div className="flex items-center justify-between gap-4">
            <AnimatedInput
              value={collateralAmount}
              onChange={handleNumericChange(setCollateralAmount)}
              onKeyDown={blockInvalidChars}
              placeholder="0"
              readOnly={quoteLoading}
            />
            <div className="shrink-0">
              <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-4 py-3 border border-border">
                <img
                  src={collateralCoin.symbol === "gUSD" ? "/gusd.png" : "/geth.png"}
                  alt={collateralCoin.symbol}
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span className="text-sm font-semibold text-foreground">
                  {collateralCoin.symbol}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rate & Duration */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/50 rounded-xl px-4 py-3.5">
          <div className="text-xs text-muted-foreground mb-2">
            Max Rate (%)
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={maxRate}
              onChange={handleNumericChange(setMaxRate)}
              onKeyDown={blockInvalidChars}
              placeholder="10"
              className="bg-transparent text-xl font-medium text-foreground outline-none w-full placeholder:text-muted-foreground/60"
            />
            <span className="text-lg text-muted-foreground font-medium">%</span>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl px-4 py-3.5">
          <div className="text-xs text-muted-foreground mb-2">
            Duration (days)
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={duration}
              onChange={handleIntChange(setDuration)}
              onKeyDown={blockInvalidChars}
              placeholder="30"
              className="bg-transparent text-xl font-medium text-foreground outline-none w-full placeholder:text-muted-foreground/60"
            />
            <span className="text-lg text-muted-foreground font-medium">d</span>
          </div>
        </div>
      </div>

      {/* Info Summary */}
      <div className="bg-muted/30 border border-border rounded-xl px-4 py-3 space-y-2">
        
        {quoteMeta && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Credit Tier</span>
              <span className="text-foreground font-medium"><RollingText text={quoteMeta.tier} /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Collateral Ratio</span>
              <span className="text-foreground font-medium"><RollingNumber value={quoteMeta.multiplier} suffix="x" /></span>
            </div>
            {quoteMeta.ethPrice && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ETH Price</span>
                <span className="text-foreground font-medium"><RollingNumber prefix="$" value={quoteMeta.ethPrice.toFixed(2)} /></span>
              </div>
            )}
          </>
        )}
        <div className={`flex items-center gap-1.5 text-xs text-muted-foreground pt-1 ${quoteMeta ? "border-t border-border" : ""}`}>
          <AlertCircle className="w-3 h-3" />
          <span>Your max rate is encrypted and hidden from the server</span>
        </div>
      </div>

      {/* Rate hint
      {hasAmountAndDuration && rateEmpty && status !== "error" && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl bg-amber-500/10 text-amber-400">
          <AlertCircle className="w-4 h-4" />
          <span>Please enter a max rate to continue</span>
        </div>
      )} */}

      {/* Status */}
      {status !== "idle" && status !== "done" && (
        <div
          className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${
            status === "error"
              ? "bg-red-500/10 text-red-400"
              : "bg-indigo-500/10 text-indigo-400"
          }`}
        >
          {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
          {status === "error" && <AlertCircle className="w-4 h-4" />}
          <span>{STATUS_LABELS[status]}</span>
          {status === "error" && error && (
            <span className="truncate ml-1">— {error}</span>
          )}
        </div>
      )}

      {/* Submit Button */}
      {authenticated ? (
        <button
          onClick={handleBorrow}
          disabled={isProcessing || rateEmpty}
          className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-medium py-4 rounded-2xl transition-colors cursor-pointer text-lg"
          style={{ backgroundColor: "#e2a9f1" }}
        >
          {isProcessing ? "Processing..." : "Submit Borrow Intent"}
        </button>
      ) : (
        <button
          onClick={login}
          className="w-full text-gray-900 font-medium py-4 rounded-2xl transition-colors cursor-pointer text-lg"
          style={{ backgroundColor: "#e2a9f1" }}
        >
          Connect Wallet
        </button>
      )}

    </div>

      {/* Intent Result */}
      {status === "done" && intentId && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 space-y-2 mt-4">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Borrow intent submitted!</span>
          </div>
          <div className="text-xs text-muted-foreground">Intent ID</div>
          <div className="font-mono text-sm text-foreground break-all">
            {intentId}
          </div>
        </div>
      )}

      {/* Active Borrow Intents */}
      {authenticated && intents.length > 0 && (
        <div className="space-y-3 mt-4">
          <h2 className="text-lg font-medium text-foreground">Your Borrow Intents</h2>
          <div className="space-y-2">
            {intents.map((intent) => (
              <div
                key={intent.intentId}
                className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Image src={tokenSymbol(intent.token) === "gETH" ? "/geth.png" : "/gusd.png"} alt="" width={32} height={32} className="rounded-full" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {formatAmount(intent.amount)} {tokenSymbol(intent.token)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Collateral: {formatAmount(intent.collateralAmount)} {tokenSymbol(intent.collateralToken)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    intent.status === "proposed"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-green-500/20 text-green-400"
                  }`}>
                    {intent.status}
                  </span>
                  {intent.status === "pending" && (
                    <button
                      onClick={() => handleCancel(intent.intentId)}
                      disabled={cancelling === intent.intentId}
                      className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer disabled:opacity-50"
                    >
                      {cancelling === intent.intentId ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default BorrowCard;
