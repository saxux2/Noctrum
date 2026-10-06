import { useState, useCallback, useEffect } from "react";
import { showToast, Toast } from "@raycast/api";
import { fetchBalances } from "../lib/external-api";
import { WalletData } from "../lib/wallet";

export interface BalanceData {
  token: string;
  balance: string;
}

export function useBalances(wallet: WalletData | null) {
  const [balances, setBalances] = useState<BalanceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setIsLoading(true);
    try {
      const data = await fetchBalances(wallet);
      setBalances(data.balances ?? []);
    } catch (e: any) {
      console.log(e);
      showToast(Toast.Style.Failure, "Failed to load balances", e.message);
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balances, isLoading, refresh };
}
