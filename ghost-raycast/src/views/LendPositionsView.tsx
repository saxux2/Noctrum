import { List, Icon, ActionPanel, Action, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { WalletData } from "../lib/wallet";
import { fetchLenderStatus, cancelLend as apiCancelLend } from "../lib/ghost-api";
import { tokenName, tokenIcon, CANCEL_LEND_TYPES, GHOST_DOMAIN } from "../lib/constants";
import { ethers } from "ethers";

export function LendPositionsView({ wallet }: { wallet: WalletData }) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    if (!wallet?.address) return;
    setIsLoading(true);
    try {
      const d = await fetchLenderStatus(wallet.address);
      setData(d);
    } catch (e: any) {
      console.log(e);
      showToast(Toast.Style.Failure, "Error", e.message);
    }
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCancel(slotId: string) {
    const toast = await showToast(Toast.Style.Animated, "Cancelling lend...");
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signer = new ethers.Wallet(wallet.privateKey);
      const auth = await signer.signTypedData(GHOST_DOMAIN, CANCEL_LEND_TYPES, {
        account: wallet.address,
        slotId,
        timestamp,
      });
      await apiCancelLend({ account: wallet.address, slotId, timestamp, auth });
      toast.style = Toast.Style.Success;
      toast.title = "Lend cancelled";
      load();
    } catch (e: any) {
      console.log(e);
      toast.style = Toast.Style.Failure;
      toast.title = "Cancel failed";
      toast.message = e.message;
    }
  }

  const fmt = (wei: string) => {
    try { return ethers.formatEther(wei); } catch { return wei; }
  };

  return (
    <List isLoading={isLoading}>
      <List.Section title="Active Lend Intents">
        {data?.activeLends?.map((l: any) => (
          <List.Item
            key={l.intentId}
            title={`${fmt(l.amount)} ${tokenName(l.token)}`}
            subtitle={`Lending at sealed rate`}
            icon={{ source: tokenIcon(l.token) }}
            accessories={[{ text: new Date(l.createdAt).toLocaleDateString() }]}
            actions={
              <ActionPanel>
                <Action title="Cancel Lend" onAction={() => handleCancel(l.slotId)} style={Action.Style.Destructive} />
              </ActionPanel>
            }
          />
        ))}
        {(!data?.activeLends || data.activeLends.length === 0) && !isLoading && (
          <List.Item title="No active lend intents" icon={Icon.XMarkCircle} />
        )}
      </List.Section>

      <List.Section title="Active Loans (as Lender)">
        {data?.activeLoans?.map((l: any) => (
          <List.Item
            key={l.loanId}
            title={`${fmt(l.principal)} ${tokenName(l.token)}`}
            subtitle={`${(l.rate * 100).toFixed(2)}% interest`}
            icon={{ source: tokenIcon(l.token) }}
            accessories={[
              { tag: `Payout: ${fmt(l.expectedPayout)} ${tokenName(l.token)}` },
              { text: `Maturity: ${new Date(l.maturity).toLocaleDateString()}` },
            ]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Loan ID" content={l.loanId} />
              </ActionPanel>
            }
          />
        ))}
        {(!data?.activeLoans || data.activeLoans.length === 0) && !isLoading && (
          <List.Item title="No active loans" icon={Icon.XMarkCircle} />
        )}
      </List.Section>

      <List.Section title="Completed Loans">
        {data?.completedLoans?.map((l: any) => (
          <List.Item
            key={l.loanId}
            title={`${fmt(l.principal)} ${tokenName(l.token)}`}
            subtitle={l.status}
            icon={{ source: tokenIcon(l.token) }}
          />
        ))}
      </List.Section>

      <List.Section title="Actions">
        <List.Item
          title="Refresh"
          icon={Icon.ArrowClockwise}
          actions={<ActionPanel><Action title="Refresh" onAction={load} /></ActionPanel>}
        />
      </List.Section>
    </List>
  );
}
