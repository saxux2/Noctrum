import SignClientModule from "@walletconnect/sign-client";
const SignClient = (SignClientModule as any).default ?? SignClientModule;
import { ethers } from "ethers";
import { CHAIN_ID, RPC_URL, WC_PROJECT_ID } from "./config";

// Default public project ID for GHOST Protocol
const PROJECT_ID = WC_PROJECT_ID || "d6938b61b2f4abcfcc04bd30277cda42";

let signClient: InstanceType<typeof SignClient> | null = null;
let initPromise: Promise<boolean> | null = null;

// userId -> WC session topic
const wcSessions = new Map<number, string>();

// userId -> address (cached from session)
const wcAddresses = new Map<number, string>();

const provider = new ethers.JsonRpcProvider(RPC_URL);

export async function initWC(): Promise<boolean> {
  console.log(`WalletConnect: initializing with projectId=${PROJECT_ID.slice(0, 8)}...`);
  try {
    signClient = await SignClient.init({
      projectId: PROJECT_ID,
      metadata: {
        name: "GHOST Protocol",
        description: "Private P2P Lending on Sepolia",
        url: "https://ghost.protocol",
        icons: [],
      },
    });

    signClient.on("session_delete", ({ topic }: { topic: string }) => {
      for (const [uid, t] of wcSessions) {
        if (t === topic) {
          wcSessions.delete(uid);
          wcAddresses.delete(uid);
          break;
        }
      }
    });

    const activeSessions = signClient.session.getAll();
    console.log(`WalletConnect initialized OK. ${activeSessions.length} existing sessions.`);
    return true;
  } catch (err: any) {
    console.error("WalletConnect init failed:", err?.message ?? err);
    return false;
  }
}

// Lazy init: called when user clicks Connect Wallet
async function ensureWC(): Promise<void> {
  if (signClient) return;
  if (!initPromise) initPromise = initWC();
  const ok = await initPromise;
  if (!ok) throw new Error("WalletConnect initialization failed. Check your connection and try again.");
}

export function isWCAvailable(): boolean {
  // Always return true — WC will lazy-init when needed
  return true;
}

export function isWCConnected(userId: number): boolean {
  const topic = wcSessions.get(userId);
  if (!topic || !signClient) return false;
  try {
    signClient.session.get(topic);
    return true;
  } catch {
    wcSessions.delete(userId);
    wcAddresses.delete(userId);
    return false;
  }
}

export function getWCAddress(userId: number): string | null {
  return wcAddresses.get(userId) ?? null;
}

export async function createWCConnection(userId: number): Promise<{
  uri: string;
  waitForApproval: () => Promise<string>;
}> {
  await ensureWC();
  if (!signClient) throw new Error("WalletConnect not available");

  const { uri, approval } = await signClient.connect({
    requiredNamespaces: {
      eip155: {
        methods: [
          "eth_sendTransaction",
          "personal_sign",
          "eth_signTypedData_v4",
        ],
        chains: [`eip155:${CHAIN_ID}`],
        events: ["chainChanged", "accountsChanged"],
      },
    },
  });

  return {
    uri: uri!,
    waitForApproval: async () => {
      const session = await approval();
      const account = session.namespaces.eip155.accounts[0];
      const address = account.split(":")[2];
      wcSessions.set(userId, session.topic);
      wcAddresses.set(userId, address);
      return address;
    },
  };
}

export function disconnectWC(userId: number) {
  const topic = wcSessions.get(userId);
  if (topic && signClient) {
    signClient
      .disconnect({ topic, reason: { code: 6000, message: "User disconnected" } })
      .catch(() => {});
  }
  wcSessions.delete(userId);
  wcAddresses.delete(userId);
}

// WalletConnect Signer compatible with ethers v6
export class WCSigner extends ethers.AbstractSigner {
  private topic: string;
  public address: string;

  constructor(topic: string, account: string, prov: ethers.Provider) {
    super(prov);
    this.topic = topic;
    this.address = account;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  connect(prov: ethers.Provider): WCSigner {
    return new WCSigner(this.topic, this.address, prov);
  }

  async signTransaction(_tx: ethers.TransactionLike): Promise<string> {
    throw new Error("Use sendTransaction instead for WalletConnect");
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    if (!signClient) throw new Error("WalletConnect not available");
    const msg =
      typeof message === "string" ? ethers.hexlify(ethers.toUtf8Bytes(message)) : ethers.hexlify(message);
    return await signClient.request({
      topic: this.topic,
      chainId: `eip155:${CHAIN_ID}`,
      request: {
        method: "personal_sign",
        params: [msg, this.address],
      },
    });
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    if (!signClient) throw new Error("WalletConnect not available");

    const domainFields: { name: string; type: string }[] = [];
    if (domain.name !== undefined) domainFields.push({ name: "name", type: "string" });
    if (domain.version !== undefined) domainFields.push({ name: "version", type: "string" });
    if (domain.chainId !== undefined) domainFields.push({ name: "chainId", type: "uint256" });
    if (domain.verifyingContract !== undefined)
      domainFields.push({ name: "verifyingContract", type: "address" });

    const primaryType = Object.keys(types)[0];

    const typedData = {
      types: { EIP712Domain: domainFields, ...types },
      primaryType,
      domain,
      message: value,
    };

    return await signClient.request({
      topic: this.topic,
      chainId: `eip155:${CHAIN_ID}`,
      request: {
        method: "eth_signTypedData_v4",
        params: [this.address, JSON.stringify(typedData)],
      },
    });
  }

  async sendTransaction(
    tx: ethers.TransactionRequest,
  ): Promise<ethers.TransactionResponse> {
    if (!signClient) throw new Error("WalletConnect not available");

    const txParams: Record<string, string> = {
      from: this.address,
      to: typeof tx.to === "string" ? tx.to : await ethers.resolveAddress(tx.to!, this.provider!),
      data: (tx.data as string) || "0x",
    };
    if (tx.value) txParams.value = ethers.toBeHex(tx.value);

    const txHash: string = await signClient.request({
      topic: this.topic,
      chainId: `eip155:${CHAIN_ID}`,
      request: {
        method: "eth_sendTransaction",
        params: [txParams],
      },
    });

    const prov = this.provider as ethers.JsonRpcProvider;
    for (let i = 0; i < 60; i++) {
      const response = await prov.getTransaction(txHash);
      if (response) return response;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Transaction ${txHash} not found after waiting`);
  }
}

export function getWCSigner(userId: number): WCSigner | null {
  const topic = wcSessions.get(userId);
  const address = wcAddresses.get(userId);
  if (!topic || !address || !signClient) return null;

  try {
    signClient.session.get(topic);
    return new WCSigner(topic, address, provider);
  } catch {
    wcSessions.delete(userId);
    wcAddresses.delete(userId);
    return null;
  }
}
