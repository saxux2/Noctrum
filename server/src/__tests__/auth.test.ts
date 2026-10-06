import { describe, it, expect, afterEach, setSystemTime } from "bun:test";
import { ethers } from "ethers";
import { post, sign, ts } from "./helpers";
import { EIP712_DOMAIN, authenticate, checkTimestamp } from "../auth";

const wallet = ethers.Wallet.createRandom();

describe("EIP-712 domain", () => {
  it("is NoctrumProtocol 0.0.1 on Monad Testnet, verifying NoctrumVault", () => {
    expect(EIP712_DOMAIN).toEqual({
      name: "NoctrumProtocol",
      version: "0.0.1",
      chainId: 10143,
      verifyingContract: "0x65877F6BFd3f2D293454658BCb290b112397Eeb5",
    });
  });

  it("valid signature passes", async () => {
    const { auth, ...msg } = await sign(wallet, "Cancel Lend", { slotId: "s" });
    expect(() => authenticate("Cancel Lend", msg, auth, wallet.address)).not.toThrow();
  });

  it("account compared case-insensitively", async () => {
    const { auth, ...msg } = await sign(wallet, "Cancel Lend", { slotId: "s" });
    expect(() => authenticate("Cancel Lend", msg, auth, wallet.address.toLowerCase())).not.toThrow();
  });

  it("Sepolia chainId (11155111) signature must fail", async () => {
    const { auth, ...msg } = await sign(wallet, "Cancel Lend", { slotId: "s" }, { ...EIP712_DOMAIN, chainId: 11155111 });
    expect(() => authenticate("Cancel Lend", msg, auth, wallet.address)).toThrow(/Signature mismatch/);
    const res = await post("/cancel-lend", { ...msg, auth });
    expect(res.status).toBe(401);
  });

  it("Foreign domain name must fail", async () => {
    const { auth, ...msg } = await sign(wallet, "Cancel Lend", { slotId: "s" }, { ...EIP712_DOMAIN, name: "OtherProtocol" });
    expect(() => authenticate("Cancel Lend", msg, auth, wallet.address)).toThrow(/Signature mismatch/);
  });

  it("wrong primary type must fail", async () => {
    const { auth, ...msg } = await sign(wallet, "Accept Proposal", { proposalId: "p" });
    expect(() => authenticate("Reject Proposal", msg, auth, wallet.address)).toThrow(/Signature mismatch/);
  });

  it("expired timestamp → 401 through a controller", async () => {
    const body = await sign(wallet, "Cancel Lend", { slotId: "s", timestamp: ts() - 301 });
    const res = await post("/cancel-lend", body);
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toBe("Signature expired: timestamp outside 5-minute window");
  });
});

describe("checkTimestamp ±300 s", () => {
  const NOW = 1_800_000_000;
  afterEach(() => setSystemTime());

  it("accepts the window edges, rejects one second beyond", () => {
    setSystemTime(new Date(NOW * 1000));
    expect(() => checkTimestamp(NOW)).not.toThrow();
    expect(() => checkTimestamp(NOW - 300)).not.toThrow();
    expect(() => checkTimestamp(NOW + 300)).not.toThrow();
    expect(() => checkTimestamp(NOW - 301)).toThrow("Signature expired: timestamp outside 5-minute window");
    expect(() => checkTimestamp(NOW + 301)).toThrow("Signature expired");
  });
});
