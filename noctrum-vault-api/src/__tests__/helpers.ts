import { ethers } from "ethers";
import app from "../app";
import { EIP712_DOMAIN, MESSAGE_TYPES, type PrimaryType } from "../auth";

export const NUSD = "0x339a948f3667d222fad43d313b3b8c3be1415ad5";
export const NETH = "0x39ad31e31b8b202e6fa7bd8682e68ac4e66ce92a";
export const wei = (n: number | string) => ethers.parseEther(String(n)).toString();

export function ts() {
  return Math.floor(Date.now() / 1000);
}

export async function signTyped(
  wallet: ethers.HDNodeWallet | ethers.Wallet,
  primaryType: PrimaryType,
  message: Record<string, unknown>,
  domain: ethers.TypedDataDomain = EIP712_DOMAIN,
) {
  return wallet.signTypedData(domain, { [primaryType]: [...MESSAGE_TYPES[primaryType]] }, message);
}

export function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function expectErrorShape(json: any, code: string) {
  if (json.error !== code) throw new Error(`expected error ${code}, got ${JSON.stringify(json)}`);
  if (typeof json.error_details !== "string") throw new Error("error_details missing");
  if (!/^[0-9a-f-]{36}$/.test(json.request_id)) throw new Error("request_id not a uuid");
}
