import { List, Icon, ActionPanel, Action, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { WalletData } from "../lib/wallet";
import { fetchTransactions } from "../lib/external-api";
import { tokenName } from "../lib/constants";
import { ethers } from "ethers";

// UUID v7 encodes timestamp in first 48 bits
function dateFromUUIDv7(id: string): Date {
  const hex = id.replace(/-/g, "").slice(0, 12);
  return new Date(parseInt(hex, 16));
}

function txIcon(tx: any): Icon {
  if (tx.type === "deposit") return Icon.ArrowDown;
  if (tx.type === "withdrawal") return Icon.ArrowUp;
  if (tx.type === "transfer" && tx.is_incoming) return Icon.ArrowDown;
  return Icon.ArrowUp;
}

function txTitle(tx: any): string {
  const token = tokenName(tx.token ?? "");
  if (tx.type === "deposit") return `Deposit ${token}`;
  if (tx.type === "withdrawal") return `Withdraw ${token}`;
  if (tx.type === "transfer") return tx.is_incoming ? `Received ${token}` : `Sent ${token}`;
  return tx.type ?? "Unknown";
}

export function TransactionsView({ wallet }: { wallet: WalletData }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function load(c = "") {
    setIsLoading(true);
    try {
      const data = await fetchTransactions(wallet, 20, c);
      const items = data.transactions ?? [];
      if (c) {
        setTxns((prev) => [...prev, ...items]);
      } else {
        setTxns(items);
      }
      setCursor(data.next_cursor ?? "");
      setHasMore(!!data.has_more);
    } catch (e: any) {
      console.log(e);
      showToast(Toast.Style.Failure, "Error", e.message);
    }
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  const fmt = (wei: string) => {
    try { return ethers.formatEther(wei); } catch { return wei; }
  };

  return (
    <List isLoading={isLoading}>
      {txns.map((tx: any) => (
        <List.Item
          key={tx.id}
          title={txTitle(tx)}
          subtitle={fmt(tx.amount ?? "0")}
          accessories={[
            ...(tx.withdraw_status ? [{ text: tx.withdraw_status }] : []),
            { text: dateFromUUIDv7(tx.id).toLocaleString() },
          ]}
          icon={txIcon(tx)}
          actions={
            <ActionPanel>
              {tx.tx_hash && <Action.CopyToClipboard title="Copy Tx Hash" content={tx.tx_hash} />}
              <Action.CopyToClipboard title="Copy Details" content={JSON.stringify(tx, null, 2)} />
            </ActionPanel>
          }
        />
      ))}
      {hasMore && (
        <List.Item
          title="Load More..."
          icon={Icon.Ellipsis}
          actions={
            <ActionPanel>
              <Action title="Load More" onAction={() => load(cursor)} />
            </ActionPanel>
          }
        />
      )}
      {txns.length === 0 && !isLoading && (
        <List.Item title="No transactions found" icon={Icon.XMarkCircle} />
      )}
    </List>
  );
}
