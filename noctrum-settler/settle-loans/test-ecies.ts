import { encrypt, decrypt, PrivateKey } from "eciesjs";

async function main() {
  console.log("=== eciesjs WASM compatibility test ===\n");

  // 1. Generate key pair
  console.log("1. Generating secp256k1 key pair...");
  const sk = new PrivateKey();
  const pk = sk.publicKey;
  console.log("   Private key (hex):", Buffer.from(sk.secret).toString("hex").slice(0, 16) + "...");
  console.log("   Public key (hex):", Buffer.from(pk.toBytes()).toString("hex").slice(0, 16) + "...");

  // 2. Encrypt
  const plaintext = "0.05";
  console.log(`\n2. Encrypting "${plaintext}"...`);
  const encrypted = encrypt(pk.toBytes(), Buffer.from(plaintext));
  console.log("   Encrypted length:", encrypted.length, "bytes");
  console.log("   Encrypted (hex):", Buffer.from(encrypted).toString("hex").slice(0, 32) + "...");

  // 3. Decrypt
  console.log("\n3. Decrypting...");
  const decrypted = decrypt(sk.secret, encrypted);
  const result = Buffer.from(decrypted).toString("utf-8");
  console.log("   Decrypted:", result);

  // 4. Verify
  if (result === plaintext) {
    console.log("\n✅ PASS: encrypt/decrypt roundtrip works!");
  } else {
    console.log("\n❌ FAIL: mismatch", { expected: plaintext, got: result });
    process.exit(1);
  }

  // 5. Check dependency chain for native modules
  console.log("\n=== Dependency analysis ===");
  console.log("eciesjs v0.4.17 deps:");
  console.log("  @ecies/ciphers (symmetric cipher adapter)");
  console.log("  @noble/ciphers (pure JS AES/ChaCha)");
  console.log("  @noble/curves  (pure JS secp256k1/ed25519)");
  console.log("  @noble/hashes  (pure JS SHA/HKDF)");
  console.log("\nAll @noble/* packages are zero-dependency pure JS.");
  console.log("@ecies/ciphers has conditional exports:");
  console.log("  - 'default' -> node.js (uses node:crypto)");
  console.log("  - 'browser' -> noble.js (pure JS)");
  console.log("\nQuickJS/WASM concern: bundler must resolve 'browser' condition");
  console.log("or manually alias @ecies/ciphers/aes to noble path.");
}

main().catch(console.error);
