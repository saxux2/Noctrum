// Redeems a vault-api ticket on the real NoctrumVault bytecode (TESTING §2.4).
// Needs anvil (~/.foundry/bin) and `forge build` artifacts in ../contracts/out; skipped otherwise.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import { VAULT_EVENTS } from "../indexer";
import { signWithdrawTicket } from "../withdrawals";

const OUT = join(import.meta.dir, "../../../contracts/out");
const ANVIL =
  Bun.which("anvil") ??
  [join(homedir(), ".foundry/bin/anvil.exe"), join(homedir(), ".foundry/bin/anvil")].find(existsSync);
const ARTIFACTS = ["PolicyEngine", "ERC1967Proxy", "NoctrumVault", "SimpleToken"];
const ready = !!ANVIL && ARTIFACTS.every((n) => existsSync(join(OUT, `${n}.sol/${n}.json`)));

// Anvil's public dev keys. #1 is the vault-api test TICKET_SIGNER_PRIVATE_KEY (setup.ts).
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];

async function factory(name: string, signer: ethers.Signer) {
  const art = await Bun.file(join(OUT, `${name}.sol/${name}.json`)).json();
  return new ethers.ContractFactory(art.abi, art.bytecode.object, signer);
}

describe.skipIf(!ready)("NoctrumVault on anvil", () => {
  let anvil: Bun.Subprocess;
  let provider: ethers.JsonRpcProvider;
  let vault: ethers.Contract;
  let token: ethers.Contract;
  let alice: ethers.Wallet;
  let ticketSigner: ethers.Wallet;
  let domain: ethers.TypedDataDomain;

  beforeAll(async () => {
    const port = 18545 + Math.floor(Math.random() * 1000);
    anvil = Bun.spawn([ANVIL!, "--port", String(port), "--chain-id", "10143", "--silent"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`, 10143, { staticNetwork: true, cacheTimeout: -1 });
    for (let i = 0; ; i++) {
      try {
        await provider.getBlockNumber();
        break;
      } catch (err) {
        if (i > 100) throw err;
        await Bun.sleep(100);
      }
    }

    const deployer = new ethers.NonceManager(new ethers.Wallet(KEYS[0]!, provider));
    const deployerAddr = await deployer.getAddress();
    ticketSigner = new ethers.Wallet(KEYS[1]!);
    alice = new ethers.Wallet(KEYS[2]!, provider);

    // Same deployment as script/02_DeployPolicyEngine.s.sol: proxy, defaultAllow = true.
    const impl = await (await factory("PolicyEngine", deployer)).deploy();
    const init = impl.interface.encodeFunctionData("initialize", [true, deployerAddr]);
    const proxy = await (await factory("ERC1967Proxy", deployer)).deploy(await impl.getAddress(), init);
    vault = (await (await factory("NoctrumVault", deployer)).deploy(deployerAddr, ticketSigner.address)) as ethers.Contract;
    token = (await (await factory("SimpleToken", deployer)).deploy("Noctrum USD", "nUSD", deployerAddr)) as ethers.Contract;
    await Promise.all([proxy, vault, token].map((c) => c.waitForDeployment()));

    await (await (vault.connect(deployer) as ethers.Contract).getFunction("register")(await token.getAddress(), await proxy.getAddress())).wait();
    await (await token.getFunction("mint")(alice.address, ethers.parseEther("100"))).wait();
    const t = token.connect(alice) as ethers.Contract;
    await (await t.getFunction("approve")(await vault.getAddress(), ethers.MaxUint256)).wait();
    await (await (vault.connect(alice) as ethers.Contract).getFunction("deposit")(await token.getAddress(), ethers.parseEther("50"))).wait();

    domain = { name: "NoctrumPrivateToken", version: "0.0.1", chainId: 10143, verifyingContract: await vault.getAddress() };
  }, 60_000);

  afterAll(() => {
    anvil?.kill();
  });

  async function ticketFor(amount: bigint, nonce: bigint, deadline?: number) {
    const block = await provider.getBlock("latest");
    return signWithdrawTicket(
      ticketSigner,
      {
        withdrawer: alice.address.toLowerCase(), // vault-api signs the lowercased account
        token: (await token.getAddress()).toLowerCase(),
        amount,
        nonce,
        deadline: deadline ?? block!.timestamp + 3600,
      },
      domain,
    );
  }

  test("vault's digest equals the vault-api ticketHash", async () => {
    const fields = { withdrawer: alice.address, token: await token.getAddress(), amount: 7n, nonce: 3n, deadline: 99 };
    const { ticketHash } = await signWithdrawTicket(ticketSigner, fields, domain);
    const onChain = await vault.getFunction("hashWithdrawTicket")(...Object.values(fields));
    expect(onChain).toBe(ticketHash);
  });

  test("withdrawWithTicket accepts a vault-api ticket and emits its hash", async () => {
    const amount = ethers.parseEther("40");
    const { ticket, ticketHash } = await ticketFor(amount, BigInt(ethers.hexlify(ethers.randomBytes(16))));
    expect(ethers.dataLength(ticket)).toBe(89);

    const v = vault.connect(alice) as ethers.Contract;
    const receipt = await (await v.getFunction("withdrawWithTicket")(await token.getAddress(), amount, ticket)).wait();
    expect(receipt.status).toBe(1);
    expect(await token.getFunction("balanceOf")(alice.address)).toBe(ethers.parseEther("90"));

    // The indexer's ABI decodes the real event and finds the ticket by its hash.
    const log = receipt.logs.find((l: ethers.Log) => l.address === (vault.target as string));
    const parsed = VAULT_EVENTS.parseLog(log)!;
    expect(parsed.name).toBe("Withdraw");
    expect(parsed.args.withdrawTicketHash).toBe(ticketHash);
    expect(parsed.args.user).toBe(alice.address);

    // Single use.
    await expect(v.getFunction("withdrawWithTicket").staticCall(await token.getAddress(), amount, ticket)).rejects.toThrow();
  });

  test("an expired ticket is rejected", async () => {
    const block = await provider.getBlock("latest");
    const { ticket } = await ticketFor(1n, 77n, block!.timestamp - 1);
    const v = vault.connect(alice) as ethers.Contract;
    const err = await v.getFunction("withdrawWithTicket").staticCall(await token.getAddress(), 1n, ticket).catch((e) => e);
    expect(err?.revert?.name).toBe("TicketExpired");
  });

  test("a ticket for another withdrawer is rejected", async () => {
    const { ticket } = await ticketFor(1n, 78n);
    const bob = new ethers.Wallet(KEYS[0]!, provider);
    const v = vault.connect(bob) as ethers.Contract;
    const err = await v.getFunction("withdrawWithTicket").staticCall(await token.getAddress(), 1n, ticket).catch((e) => e);
    expect(err?.revert?.name).toBe("InvalidTicketSignature");
  });
});
