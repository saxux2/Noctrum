"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowDownUp, Loader2, AlertCircle, ChevronDown, Check } from "lucide-react";
import { ethers } from "ethers";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { get } from "@/lib/ghost";
import { pushNotification } from "@/hooks/useNotifications";
import { RollingNumber, RollingText } from "@/components/ui/rolling-text";
import {
  CHAIN_ID,
  gUSD,
  gETH,
  ERC20_ABI,
  SWAP_POOL_ADDRESS,
  SWAP_POOL_ABI,
} from "@/lib/constants";
import {
  CHAINS,
  executeBridge,
  friendlyBridgeError,
  type BridgeStatus,
  type ChainInfo,
} from "@/lib/wormhole";

const GHOST_TOKENS = [
  { symbol: "gUSD", name: "Ghost USD", address: gUSD, icon: "/gusd.png" },
  { symbol: "gETH", name: "Ghost ETH", address: gETH, icon: "/geth.png" },
];

type Status =
  | "idle"
  | "quoting"
  | "approving"
  | "swapping"
  | "initiating"
  | "attesting"
  | "redeeming"
  | "done"
  | "error";

function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const e = err as any;
  const code = e?.code ?? e?.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return "Transaction rejected";
  if (e?.code === "INSUFFICIENT_FUNDS") return "Insufficient funds";
  const msg = e?.shortMessage ?? e?.reason ?? e?.message ?? "Transaction failed";
  return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
}

const SwapTab = () => {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  // Source chain (0 = Sepolia, others = bridge)
  const [srcChainIdx, setSrcChainIdx] = useState(0);
  // Source token index (for Sepolia: gUSD/gETH, for others: native only)
  const [fromTokenIdx, setFromTokenIdx] = useState(0);
  // Destination token: always gUSD or gETH
  const [toTokenIdx, setToTokenIdx] = useState(1);

  const [amount, setAmount] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [rateLabel, setRateLabel] = useState("");
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [bridgeSrcHash, setBridgeSrcHash] = useState("");
  const [bridgeDstHash, setBridgeDstHash] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fromBalance, setFromBalance] = useState("");
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);

  const srcChain = CHAINS[srcChainIdx];
  const isSepolia = srcChain.id === "Sepolia";

  // On Sepolia: swap between gUSD/gETH. Off-chain: bridge native → gUSD/gETH
  const fromToken = isSepolia
    ? GHOST_TOKENS[fromTokenIdx]
    : { symbol: srcChain.nativeSymbol, name: srcChain.label, address: "", icon: srcChain.logo };
  const toToken = GHOST_TOKENS[toTokenIdx];

  const flip = () => {
    if (isSepolia) {
      // Swap from/to tokens
      const newFrom = toTokenIdx;
      const newTo = fromTokenIdx;
      setFromTokenIdx(newFrom);
      setToTokenIdx(newTo);
    }
    resetState();
  };

  const resetState = () => {
    setAmount("");
    setAmountOut("");
    setRateLabel("");
    setError("");
    setTxHash("");
    setBridgeSrcHash("");
    setBridgeDstHash("");
    setStatus("idle");
  };

  // Fetch from-token balance
  useEffect(() => {
    if (!isSepolia || !wallets[0] || !fromToken.address) {
      setFromBalance("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const provider = await wallets[0].getEthereumProvider();
        const ethProvider = new ethers.BrowserProvider(provider);
        const signer = await ethProvider.getSigner();
        const token = new ethers.Contract(fromToken.address, ERC20_ABI, ethProvider);
        const bal = await token.balanceOf(await signer.getAddress());
        const formatted = parseFloat(ethers.formatEther(bal));
        if (!cancelled) setFromBalance(formatted < 0.01 && formatted > 0 ? "<0.01" : formatted.toLocaleString(undefined, { maximumFractionDigits: 4 }));
      } catch {
        if (!cancelled) setFromBalance("");
      }
    })();
    return () => { cancelled = true; };
  }, [isSepolia, fromToken.address, wallets, status]);

  // Fetch swap quote when on Sepolia
  useEffect(() => {
    if (!isSepolia) {
      // For bridge, output = input (native → native, 1:1 before fees)
      if (amount && parseFloat(amount) > 0) {
        setAmountOut(amount);
      } else {
        setAmountOut("");
      }
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const parsed = parseFloat(amount);
    if (!amount || !parsed || parsed <= 0) {
      setAmountOut("");
      setRateLabel("");
      return;
    }

    setStatus("quoting");
    debounceRef.current = setTimeout(async () => {
      try {
        const amountWei = ethers.parseEther(parsed.toString()).toString();
        const params = new URLSearchParams({
          tokenIn: fromToken.address,
          tokenOut: toToken.address,
          amountIn: amountWei,
        });
        const data = await get(`/api/v1/swap-quote?${params}`);
        if (data.error) throw new Error(data.error);

        const outFormatted = parseFloat(ethers.formatEther(data.amountOut));
        setAmountOut(outFormatted.toFixed(outFormatted < 1 ? 8 : 4));
        setRateLabel(data.rate);
        setEthPrice(data.ethPrice);
        setStatus("idle");
      } catch {
        setAmountOut("");
        setRateLabel("");
        setStatus("idle");
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, fromToken.address, toToken.address, isSepolia]);

  const handleSwap = async () => {
    const wallet = wallets[0];
    if (!wallet || !amount || !amountOut) return;

    setError("");
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const amountInWei = ethers.parseEther(amount);
      const minOut = (ethers.parseEther(amountOut) * BigInt(99)) / BigInt(100);

      setStatus("approving");
      const token = new ethers.Contract(fromToken.address, ERC20_ABI, signer);
      const approveTx = await token.approve(SWAP_POOL_ADDRESS, amountInWei);
      await approveTx.wait();

      setStatus("swapping");
      const pool = new ethers.Contract(SWAP_POOL_ADDRESS, SWAP_POOL_ABI, signer);
      const swapTx = await pool.swap(fromToken.address, toToken.address, amountInWei, minOut);
      await swapTx.wait();

      setTxHash(swapTx.hash);
      setStatus("done");
      pushNotification({
        title: "Swap Complete",
        message: `Swapped ${amount} ${fromToken.symbol} for ${amountOut} ${toToken.symbol}`,
      });
      setAmount("");
      setAmountOut("");
    } catch (err: unknown) {
      setError(friendlyError(err));
      setStatus("error");
    }
  };

  const handleBridge = async () => {
    const wallet = wallets[0];
    if (!wallet || !amount || parseFloat(amount) <= 0) return;

    setError("");
    setBridgeSrcHash("");
    setBridgeDstHash("");

    try {
      await wallet.switchChain(srcChain.chainId);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const result = await executeBridge(
        {
          srcChain: srcChain.id,
          dstChain: "Sepolia",
          amount,
          srcAddress: address,
          dstAddress: address,
        },
        signer,
        signer,
        (s) => setStatus(s)
      );

      if (result.srcTxHash) setBridgeSrcHash(result.srcTxHash);
      if (result.dstTxHash) setBridgeDstHash(result.dstTxHash);
      pushNotification({
        title: "Bridge Complete",
        message: `Bridged ${amount} from ${srcChain.label} to Sepolia`,
      });
    } catch (err: unknown) {
      setError(friendlyBridgeError(err));
      setStatus("error");
    }
  };

  const handleAction = () => {
    if (isSepolia) handleSwap();
    else handleBridge();
  };

  const handleInput = (v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) {
      setAmount(v);
      if (status === "done" || status === "error") setStatus("idle");
      setError("");
    }
  };

  const isProcessing = ["approving", "swapping", "initiating", "attesting", "redeeming"].includes(status);
  const canExecute = amount && parseFloat(amount) > 0 && amountOut && !isProcessing;

  const statusLabel: Record<string, string> = {
    approving: `Approving ${fromToken.symbol}...`,
    swapping: `Swapping ${fromToken.symbol} for ${toToken.symbol}...`,
    initiating: `Initiating bridge on ${srcChain.label}...`,
    attesting: "Waiting for attestation from guardians...",
    redeeming: "Completing bridge on Sepolia...",
  };

  const buttonLabel = isProcessing
    ? statusLabel[status] ?? "Processing..."
    : canExecute
    ? isSepolia
      ? "Swap"
      : "Bridge"
    : "Enter an amount";

  return (
    <div className="space-y-5 py-4">
      <div className="bg-card border border-border rounded-2xl">
        {/* From */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">
              You pay
              {fromBalance && (
                <span className="ml-2 text-muted-foreground/60">
                  Bal: {fromBalance} {fromToken.symbol}
                </span>
              )}
            </p>
            {/* Chain selector */}
            <ChainDropdown
              chains={CHAINS}
              selectedIdx={srcChainIdx}
              open={chainDropdownOpen}
              setOpen={setChainDropdownOpen}
              onSelect={(i) => {
                setSrcChainIdx(i);
                setChainDropdownOpen(false);
                setFromTokenIdx(0);
                setToTokenIdx(CHAINS[i].id === "Sepolia" ? 1 : 0);
                resetState();
              }}
            />
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => {
                if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
              }}
              placeholder="0.00"
              className="bg-transparent text-[28px] font-medium text-foreground outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40"
            />
            {isSepolia ? (
              <TokenDropdown
                tokens={GHOST_TOKENS}
                selectedIdx={fromTokenIdx}
                open={fromDropdownOpen}
                setOpen={setFromDropdownOpen}
                onSelect={(i) => {
                  setFromTokenIdx(i);
                  setToTokenIdx(i === 0 ? 1 : 0);
                  setFromDropdownOpen(false);
                  resetState();
                }}
              />
            ) : (
              <div className="flex items-center gap-2.5 bg-muted/60 rounded-full pl-2 pr-3.5 py-1.5 shrink-0">
                <img src={srcChain.logo} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {srcChain.nativeSymbol}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Divider + Flip */}
        <div className="relative h-0">
          <div className="absolute inset-x-5 border-t border-border" />
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2">
            <button
              onClick={flip}
              disabled={!isSepolia}
              className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-accent active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* To */}
        <div className="px-5 pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">You receive</p>
            {!isSepolia && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <img src="/chains/ethereum.png" alt="" className="w-4 h-4 rounded-full" />
                <span>Sepolia</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-[28px] font-medium text-muted-foreground/40 flex-1 min-w-0 truncate">
              <RollingNumber value={amountOut || "0.00"} />
            </p>
            <TokenDropdown
              tokens={GHOST_TOKENS}
              selectedIdx={toTokenIdx}
              open={toDropdownOpen}
              setOpen={setToDropdownOpen}
              onSelect={(i) => {
                setToTokenIdx(i);
                if (isSepolia) setFromTokenIdx(i === 0 ? 1 : 0);
                setToDropdownOpen(false);
                resetState();
              }}
            />
          </div>
        </div>
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          <RollingText text={isSepolia
            ? rateLabel || "Enter amount for quote"
            : "Bridged via Wormhole (manual, no relayer fee)"} />
        </span>
        <span>
          {isSepolia ? "Sepolia" : `${srcChain.label} → Sepolia`}
        </span>
      </div>

      {/* Status feedback */}
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl bg-muted/50 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{statusLabel[status]}</span>
        </div>
      )}
      {status === "attesting" && (
        <div className="text-center text-xs text-muted-foreground/60">
          Attestation may take ~15 min on Ethereum, faster on L2s
        </div>
      )}
      {status === "done" && (
        <div className="text-sm px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-400 space-y-1">
          <span>{isSepolia ? "Swap successful!" : "Bridge complete!"}</span>
          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-emerald-400/70 hover:text-emerald-300 underline underline-offset-2 truncate"
            >
              View on Etherscan: {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          )}
          {bridgeSrcHash && (
            <a
              href={`${srcChain.explorer}/tx/${bridgeSrcHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-emerald-400/70 hover:text-emerald-300 underline underline-offset-2 truncate"
            >
              Source tx: {bridgeSrcHash.slice(0, 10)}...{bridgeSrcHash.slice(-8)}
            </a>
          )}
          {bridgeDstHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${bridgeDstHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-emerald-400/70 hover:text-emerald-300 underline underline-offset-2 truncate"
            >
              Dest tx: {bridgeDstHash.slice(0, 10)}...{bridgeDstHash.slice(-8)}
            </a>
          )}
        </div>
      )}
      {status === "error" && error && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl bg-red-500/10 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Action */}
      {authenticated ? (
        <button
          onClick={handleAction}
          disabled={!canExecute}
          className="w-full text-gray-900 font-semibold py-3.5 rounded-xl transition-colors cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#e2a9f1" }}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {buttonLabel}
            </span>
          ) : (
            buttonLabel
          )}
        </button>
      ) : (
        <button
          onClick={login}
          className="w-full text-gray-900 font-semibold py-3.5 rounded-xl transition-colors cursor-pointer text-sm"
          style={{ backgroundColor: "#e2a9f1" }}
        >
          Connect Wallet
        </button>
      )}

      {/* Pool info */}
      {ethPrice && isSepolia && (
        <div className="text-center text-xs text-muted-foreground/60">
          ETH/USD: ${ethPrice.toFixed(2)} (Chainlink)
        </div>
      )}
    </div>
  );
};

/* ── Chain Dropdown ── */
function ChainDropdown({
  chains,
  selectedIdx,
  open,
  setOpen,
  onSelect,
}: {
  chains: ChainInfo[];
  selectedIdx: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelect: (i: number) => void;
}) {
  const selected = chains[selectedIdx];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-muted/60 rounded-full pl-2 pr-2.5 py-1 cursor-pointer hover:bg-muted transition-colors"
      >
        <img src={selected.logo} alt="" className="w-4 h-4 rounded-full object-cover" />
        <span className="text-xs font-medium text-foreground whitespace-nowrap">
          {selected.label}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-lg z-50 min-w-[200px] max-h-[280px] overflow-y-auto">
          {chains.map((chain, i) => (
            <button
              key={chain.id}
              onClick={() => onSelect(i)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors cursor-pointer ${
                i === selectedIdx
                  ? "bg-accent text-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <img src={chain.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
              <span className="flex-1">{chain.label}</span>
              {i === selectedIdx && (
                <Check className="w-3.5 h-3.5" style={{ color: "#e2a9f1" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Token Dropdown ── */
function TokenDropdown({
  tokens,
  selectedIdx,
  open,
  setOpen,
  onSelect,
}: {
  tokens: typeof GHOST_TOKENS;
  selectedIdx: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelect: (i: number) => void;
}) {
  const selected = tokens[selectedIdx];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setOpen]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 bg-muted/60 rounded-full pl-2 pr-3 py-1.5 cursor-pointer hover:bg-muted transition-colors"
      >
        <img src={selected.icon} alt="" className="w-6 h-6 rounded-full object-cover" />
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          {selected.symbol}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden min-w-[176px]">
          {tokens.map((token, i) => (
            <button
              key={token.symbol}
              onClick={() => onSelect(i)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors cursor-pointer ${
                i === selectedIdx
                  ? "bg-accent text-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <img src={token.icon} alt="" className="w-5 h-5 rounded-full object-cover" />
              <span className="flex-1">{token.symbol}</span>
              {i === selectedIdx && (
                <Check className="w-3.5 h-3.5" style={{ color: "#e2a9f1" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SwapTab;
