"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { ethers } from "ethers";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { post, get, ts } from "@/lib/ghost";
import {
  CHAIN_ID,
  GHOST_DOMAIN,
  CANCEL_LEND_TYPES,
  VAULT_ADDRESS,
  VAULT_ABI,
  gUSD,
} from "@/lib/constants";

const MigrateTab = () => {
  const [subTab, setSubTab] = useState<"Active" | "History">("Active");
  const [lendSlots, setLendSlots] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");

  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const userAddress = wallets?.[0]?.address?.toLowerCase();

  const loadPositions = async () => {
    if (!userAddress) return;
    try {
      const data = await get(`/api/v1/lender-status/${userAddress}`);
      setLendSlots(data.lendSlots ?? []);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (authenticated && userAddress) loadPositions();
  }, [authenticated, userAddress]);

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
      const auth = await signer.signTypedData(GHOST_DOMAIN, CANCEL_LEND_TYPES, message);
      await post("/api/v1/cancel-lend", { ...message, auth });
      await loadPositions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(null);
    }
  };

  const handleWithdraw = async () => {
    const wallet = wallets[0];
    if (!wallet) return;

    setWithdrawing(true);
    setError("");
    try {
      await wallet.switchChain(CHAIN_ID);
      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const balance = await get(`/api/v1/lender-status/${userAddress}`);
      const totalDeposited = (balance.lendSlots ?? []).reduce(
        (sum: bigint, s: any) => sum + BigInt(s.amount ?? "0"),
        BigInt(0)
      );

      if (totalDeposited <= BigInt(0)) {
        setError("No funds to withdraw");
        return;
      }

      const tx = await vault.withdrawWithTicket(gUSD, totalDeposited, "0x");
      await tx.wait();
      await loadPositions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setWithdrawing(false);
    }
  };

  const filteredSlots = lendSlots.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.slotId?.toLowerCase().includes(q) ||
      s.token?.toLowerCase().includes(q)
    );
  });

  const activeSlots = filteredSlots.filter((s) => s.status !== "cancelled");
  const historySlots = filteredSlots.filter((s) => s.status === "cancelled");
  const displaySlots = subTab === "Active" ? activeSlots : historySlots;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium text-foreground">
        Manage your positions
      </h1>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        {/* Active / History toggle */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSubTab("Active")}
            className={`text-sm font-medium transition-colors cursor-pointer ${
              subTab === "Active"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active Loans
          </button>
          <button
            onClick={() => setSubTab("History")}
            className={`text-sm font-medium transition-colors cursor-pointer ${
              subTab === "History"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            History
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by slot ID or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/50 transition-colors"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Positions or empty state */}
        {!authenticated || !userAddress ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to view your lending and borrowing positions
            </p>
          </div>
        ) : displaySlots.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              {subTab === "Active" ? "No active positions" : "No history yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displaySlots.map((slot: any) => (
              <div
                key={slot.slotId}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {(Number(BigInt(slot.amount ?? "0")) / 1e18).toLocaleString()} gUSD
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {slot.slotId?.slice(0, 12)}...
                  </p>
                </div>
                {subTab === "Active" && (
                  <button
                    onClick={() => handleCancelLend(slot.slotId)}
                    disabled={cancelling === slot.slotId}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {cancelling === slot.slotId ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Cancel Lend - shows only when there are active positions */}
        <button
          onClick={() => {
            if (activeSlots.length === 1) {
              handleCancelLend(activeSlots[0].slotId);
            }
          }}
          disabled={!authenticated || activeSlots.length === 0 || cancelling !== null}
          className="w-full text-gray-900 font-semibold py-4 rounded-xl transition-colors cursor-pointer text-base disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#e2a9f1" }}
        >
          {cancelling ? "Cancelling..." : "Cancel Lend Position"}
        </button>

        {/* Withdraw */}
        <button
          onClick={handleWithdraw}
          disabled={!authenticated || withdrawing}
          className="w-full border border-border text-muted-foreground font-semibold py-4 rounded-xl transition-colors cursor-pointer text-base hover:text-foreground hover:border-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {withdrawing ? "Withdrawing..." : "Withdraw from Vault"}
        </button>
      </div>
    </div>
  );
};

export default MigrateTab;
