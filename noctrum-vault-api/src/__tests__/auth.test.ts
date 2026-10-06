import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import { authenticate, EIP712_DOMAIN, type PrimaryType } from "../auth";
import { ApiError } from "../errors";
import { NUSD, signTyped, ts, wei } from "./helpers";

const alice = ethers.Wallet.createRandom();
const bob = ethers.Wallet.createRandom();

// One fixture per CPT request type, as Ghost clients build them.
function fixtures(): Record<PrimaryType, Record<string, unknown>> {
  const t = ts();
  return {
    "Retrieve Balances": { account: alice.address, timestamp: t },
    "List Transactions": { account: alice.address, timestamp: t, cursor: "", limit: 20 },
    "Private Token Transfer": {
      sender: alice.address,
      recipient: bob.address,
      token: NUSD,
      amount: wei(1),
      flags: ["hide-sender"],
      timestamp: t,
    },
    "Generate Shielded Address": { account: alice.address, timestamp: t },
    "Withdraw Tokens": { account: alice.address, token: NUSD, amount: wei(10), timestamp: t },
  };
}

function codeOf(fn: () => void) {
  try {
    fn();
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
  return null;
}

describe("EIP-712 domain", () => {
  test("matches NoctrumVault (D-5)", () => {
    expect(EIP712_DOMAIN).toEqual({
      name: "NoctrumPrivateToken",
      version: "0.0.1",
      chainId: 10143,
      verifyingContract: "0x65877F6BFd3f2D293454658BCb290b112397Eeb5",
    });
  });
});

describe.each(Object.keys(fixtures()) as PrimaryType[])("%s", (type) => {
  test("valid signature verifies", async () => {
    const msg = fixtures()[type];
    const auth = await signTyped(alice, type, msg);
    expect(codeOf(() => authenticate(type, msg, auth, alice.address))).toBeNull();
    // address case does not matter
    expect(codeOf(() => authenticate(type, msg, auth, alice.address.toLowerCase()))).toBeNull();
  });

  test("signature by another key fails", async () => {
    const msg = fixtures()[type];
    const auth = await signTyped(bob, type, msg);
    expect(codeOf(() => authenticate(type, msg, auth, alice.address))).toBe("request_auth_failed");
  });

  test("tampered message fails", async () => {
    const msg = fixtures()[type];
    const auth = await signTyped(alice, type, msg);
    const tampered = { ...msg, timestamp: Number(msg.timestamp) + 1 };
    expect(codeOf(() => authenticate(type, tampered, auth, alice.address))).toBe("request_auth_failed");
  });

  test("Ghost/CPT domain name is rejected", async () => {
    const msg = fixtures()[type];
    const auth = await signTyped(alice, type, msg, { ...EIP712_DOMAIN, name: "CompliantPrivateTokenDemo" });
    expect(codeOf(() => authenticate(type, msg, auth, alice.address))).toBe("request_auth_failed");
  });

  test("timestamp outside ±300 s is expired", async () => {
    for (const offset of [-301, 301]) {
      const msg = { ...fixtures()[type], timestamp: ts() + offset };
      const auth = await signTyped(alice, type, msg);
      expect(codeOf(() => authenticate(type, msg, auth, alice.address))).toBe("request_auth_expired");
    }
  });
});

test("timestamp as a string is accepted (uint256 JSON)", async () => {
  const msg = { account: alice.address, timestamp: String(ts()) };
  const auth = await signTyped(alice, "Retrieve Balances", msg);
  expect(codeOf(() => authenticate("Retrieve Balances", msg, auth, alice.address))).toBeNull();
});

test("malformed auth is request_auth_failed", () => {
  const msg = { account: alice.address, timestamp: ts() };
  expect(codeOf(() => authenticate("Retrieve Balances", msg, "nope", alice.address))).toBe("request_auth_failed");
  expect(codeOf(() => authenticate("Retrieve Balances", msg, "0x1234", alice.address))).toBe("request_auth_failed");
});
