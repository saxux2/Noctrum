"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import CoinSelector from "../borrow/CoinSelector";
import {
  COINS,
  CHAIN_ID,
  VAULT_ADDRESS,
  gUSD,
  gETH,
  ERC20_ABI,
  VAULT_ABI,
  GHOST_DOMAIN,
  CONFIRM_DEPOSIT_TYPES,
  CANCEL_LEND_TYPES,
  fetchPoolAddress,
  type Coin,
} from "@/lib/constants";
import { encryptRate, get, post, privateTransfer, toWei, ts } from "@/lib/ghost";

type Status =
  | "idle"
  | "approving"
  | "depositing"
  | "initializing"
  | "transferring"
  | "confirming"
  | "done"
  | "error";

const STATUS_LABELS: Record<Status, string> = {
  idle: "",
  approving: "Approving token spend...",
  depositing: "Depositing into vault...",
  initializing: "Initializing lend intent...",
  transferring: "Private transferring to pool...",
  confirming: "Confirming lend intent...",
  done: "Lend intent published!",
  error: "Something went wrong",
};

interface LendIntent {
  intentId: string;
  slotId: string;
  token: string;
  amount: string;
  createdAt: number;
}

const formatAmount = (wei: string) => {
  const num = Number(wei) / 1e18;
  return num.toLocaleString(undefined, { maximumFractionDigits: 5 });
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

const tokenSymbol = (addr: string) => {
  const lower = addr.toLowerCase();
  if (lower === gUSD.toLowerCase()) return "gUSD";
  if (lower === gETH.toLowerCase()) return "gETH";
  return addr.slice(0, 6) + "...";
};

const LendCard = () => {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [lendCoin, setLendCoin] = useState<Coin>(COINS[0]);
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [duration, setDuration] = useState("30");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [resultIntentId, setResultIntentId] = useState("");
  const [intents, setIntents] = useState<LendIntent[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const walletAddress = wallets[0]?.address;
  const isProcessing = ["approving", "depositing", "initializing", "transferring", "confirming"].includes(status);
  const rateEmpty = !rate || rate.trim() === "";
  const hasAmountAndDuration = parseFloat(amount) > 0 && parseInt(duration) > 0;

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

  const loadIntents = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const data: any = await get(`/api/v1/lender-status/${walletAddress}`);
      setIntents(data.activeLends ?? []);
    } catch {
      // silent
    }
  }, [walletAddress]);

  useEffect(() => {
    loadIntents();
  }, [loadIntents]);

  const validateInputs = (): string | null => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return "Enter a valid lend amount";
    const r = parseFloat(rate);
    if (isNaN(r) || r <= 0 || r > 100) return "Rate must be between 0 and 100%";
    const dur = parseInt(duration);
    if (!dur || dur <= 0) return "Enter a valid duration";
    return null;
  };

  const handleLend = async () => {
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
      setResultIntentId("");

      await wallet.switchChain(CHAIN_ID);

      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();

      const amountWei = toWei(parseFloat(amount));
      const rateDecimal = (parseFloat(rate) / 100).toString();

      const tokenAddr = lendCoin.address;

      // Step 1: Approve token to vault
      setStatus("approving");
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
      const approveTx = await token.approve(VAULT_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();

      // Step 2: Deposit token into vault
      setStatus("depositing");
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const depositTx = await vault.deposit(tokenAddr, amountWei);
      await depositTx.wait();

      // Step 3: Init deposit-lend on server
      setStatus("initializing");
      const init: any = await post("/api/v1/deposit-lend/init", {
        account,
        token: tokenAddr,
        amount: amountWei,
      });
      const slotId = init.slotId;

      // Step 4: Private transfer to pool
      setStatus("transferring");
      const poolAddr = await fetchPoolAddress();
      await privateTransfer(signer, poolAddr, tokenAddr, amountWei);

      // Step 5: Confirm with encrypted rate
      setStatus("confirming");
      const encrypted = encryptRate(rateDecimal);
      const timestamp = ts();
      const confirmMsg = { account, slotId, encryptedRate: encrypted, timestamp };
      const auth = await signer.signTypedData(GHOST_DOMAIN, CONFIRM_DEPOSIT_TYPES, confirmMsg);
      const result: any = await post("/api/v1/deposit-lend/confirm", { ...confirmMsg, auth });

      setResultIntentId(result.intentId);
      setStatus("done");
      setAmount("");
      setRate("");
      await loadIntents();
    } catch (err: unknown) {
      setError(friendlyError(err));
      setStatus("error");
    }
  };

  const handleCancel = async (slotId: string) => {
    const wallet = wallets[0];
    if (!wallet) return;

    setCancelling(slotId);
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const timestamp = ts();

      const message = { account, slotId, timestamp };
      const auth = await signer.signTypedData(GHOST_DOMAIN, CANCEL_LEND_TYPES, message);
      await post("/api/v1/cancel-lend", { ...message, auth });
      await loadIntents();
    } catch (err: unknown) {
      setError(friendlyError(err));
      setStatus("error");
    } finally {
      setCancelling(null);
    }
  };

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        {/* Amount */}
        <div className="bg-muted/50 rounded-xl px-5 py-4">
          <div className="text-sm text-muted-foreground mb-3">Amount to lend</div>
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleNumericChange(setAmount)}
              onKeyDown={blockInvalidChars}
              placeholder="0"
              className="bg-transparent text-3xl font-medium text-foreground outline-none w-full placeholder:text-muted-foreground/60"
            />
            <div className="shrink-0 w-36">
              <CoinSelector
                coins={[...COINS]}
                selected={lendCoin}
                onSelect={setLendCoin}
                label=""
              />
            </div>
          </div>
        </div>

        {/* Rate & Duration */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-xl px-4 py-3.5">
            <div className="text-xs text-muted-foreground mb-2">Your Rate (%)</div>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={handleNumericChange(setRate)}
                onKeyDown={blockInvalidChars}
                placeholder="5"
                className="bg-transparent text-xl font-medium text-foreground outline-none w-full placeholder:text-muted-foreground/60"
              />
              <span className="text-lg text-muted-foreground font-medium">%</span>
            </div>
          </div>

          <div className="bg-muted/50 rounded-xl px-4 py-3.5">
            <div className="text-xs text-muted-foreground mb-2">Duration (days)</div>
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

        {/* Summary */}
        <div className="bg-muted/30 border border-border rounded-xl px-4 py-3 space-y-2">
          {amount && rate && Number(amount) > 0 && Number(rate) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expected Return</span>
              <span className="text-foreground font-medium">
                {(Number(amount) * (1 + Number(rate) / 100)).toFixed(5)} {lendCoin.symbol}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="w-3 h-3" />
            <span>Your rate is encrypted and hidden from the server</span>
          </div>
        </div>

        {/* Rate hint */}
        {hasAmountAndDuration && rateEmpty && status !== "error" && (
          <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl bg-amber-500/10 text-amber-400">
            <AlertCircle className="w-4 h-4" />
            <span>Please enter a rate to continue</span>
          </div>
        )}

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

        {/* Submit */}
        {authenticated ? (
          <button
            onClick={handleLend}
            disabled={isProcessing || rateEmpty}
            className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-medium py-4 rounded-2xl transition-colors cursor-pointer text-lg"
            style={{ backgroundColor: "#e2a9f1" }}
          >
            {isProcessing ? "Processing..." : "Publish Lend Intent"}
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

      {/* Success Result */}
      {status === "done" && resultIntentId && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 space-y-2 mt-4">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Lend intent published!</span>
          </div>
          <div className="text-xs text-muted-foreground">Intent ID</div>
          <div className="font-mono text-sm text-foreground break-all">{resultIntentId}</div>
        </div>
      )}

      {/* Active Lend Intents */}
      {authenticated && intents.length > 0 && (
        <div className="space-y-3 mt-4">
          <h2 className="text-lg font-medium text-foreground">Your Lend Intents</h2>
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
                      {intent.intentId.slice(0, 8)}...
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/20 text-green-400">
                    active
                  </span>
                  <button
                    onClick={() => handleCancel(intent.slotId)}
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
    </>
  );
};

export default LendCard;
