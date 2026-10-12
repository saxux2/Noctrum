import { List, Form, Action, ActionPanel, Icon, showToast, Toast, confirmAlert, useNavigation } from "@raycast/api";
import { useState, useEffect } from "react";
import { getStoredWallet, createWallet, storeWallet, deleteWallet, WalletData } from "../lib/wallet";

// MetaMask's "Show private key" gives the key without the 0x prefix, so accept both forms.
function normalizeKey(input: string): string | null {
  const raw = input.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? `0x${raw}` : raw;
  return /^0x[0-9a-fA-F]{64}$/.test(key) ? key : null;
}

// Paste-in form instead of reading the clipboard, which proved unreliable on Raycast for Windows.
function ImportWalletForm({ onImported }: { onImported: (w: WalletData) => void }) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(values: { privateKey: string }) {
    const key = normalizeKey(values.privateKey ?? "");
    if (!key) {
      setError("Enter a 64-character hex private key (with or without 0x)");
      return;
    }
    try {
      const w = await storeWallet(key);
      showToast(Toast.Style.Success, "Wallet imported", w.address);
      onImported(w);
      pop();
    } catch {
      setError("Invalid private key");
    }
  }

  return (
    <Form
      navigationTitle="Import Wallet"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Import Wallet" icon={Icon.Key} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Paste the private key of a Monad Testnet wallet. It is stored only in Raycast on this computer. Use a test-only wallet." />
      <Form.PasswordField
        id="privateKey"
        title="Private Key"
        placeholder="0x… or 64 hex characters"
        error={error}
        onChange={() => setError(undefined)}
      />
    </Form>
  );
}

export function WalletView({ onDone }: { onDone?: () => void }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    const w = await getStoredWallet();
    setWallet(w);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    const w = await createWallet();
    setWallet(w);
    showToast(Toast.Style.Success, "Wallet created", w.address);
    onDone?.();
  }

  function handleImported(w: WalletData) {
    setWallet(w);
    onDone?.();
  }

  async function handleDelete() {
    if (await confirmAlert({ title: "Delete wallet?", message: "This removes the stored key from Raycast." })) {
      await deleteWallet();
      setWallet(null);
      showToast(Toast.Style.Success, "Wallet deleted");
      onDone?.();
    }
  }

  const importAction = (
    <ActionPanel>
      <Action.Push title="Import Wallet" icon={Icon.Key} target={<ImportWalletForm onImported={handleImported} />} />
    </ActionPanel>
  );

  if (isLoading) return <List isLoading />;

  if (!wallet) {
    return (
      <List>
        <List.Section title="No Wallet Found">
          <List.Item
            title="Create New Wallet"
            subtitle="Generate a random Monad Testnet wallet"
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                <Action title="Create Wallet" onAction={handleCreate} />
              </ActionPanel>
            }
          />
          <List.Item title="Import Wallet" subtitle="Paste a private key" icon={Icon.Key} actions={importAction} />
        </List.Section>
      </List>
    );
  }

  return (
    <List>
      <List.Section title="Active Wallet">
        <List.Item
          title="Address"
          subtitle={wallet.address}
          icon={Icon.Person}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Address" content={wallet.address} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Copy Private Key"
          subtitle="Copy to clipboard"
          icon={Icon.Key}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Private Key" content={wallet.privateKey} concealed />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Actions">
        <List.Item title="Import Different Wallet" subtitle="Replace with another private key" icon={Icon.Key} actions={importAction} />
        <List.Item
          title="Delete Wallet"
          subtitle="Remove stored wallet"
          icon={Icon.Trash}
          actions={
            <ActionPanel>
              <Action title="Delete Wallet" onAction={handleDelete} style={Action.Style.Destructive} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
