import { useState, useCallback, useEffect } from "react";
import { showToast, Toast } from "@raycast/api";
import { fetchLenderStatus } from "../lib/ghost-api";
import { WalletData } from "../lib/wallet";

export function useLenderStatus(wallet: WalletData | null) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setIsLoading(true);
    try {
      const d = await fetchLenderStatus(wallet.address);
      setData(d);
    } catch (e: any) {
      console.log(e);
      showToast(Toast.Style.Failure, "Failed to load lender status", e.message);
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, refresh };
}
