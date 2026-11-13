/**
 * Deploys Bitty Beasts to NEAR testnet, end to end. Idempotent: re-run it after a failure.
 *
 *   ./node_modules/.bin/tsx scripts/deploy.ts
 *
 * Steps
 *  1. ROOT: `bittybeasts-<random>.testnet` through the testnet faucet, plus donor faucet accounts
 *     deleted into ROOT (the contracts need ~30 testnet NEAR; testnet NEAR is free).
 *  2. Sub-accounts: alley, yarn, wallet, studio and the four merchants.
 *  3. wallet.ROOT publishes the beast-wallet as a NEP-591 global contract (by account id).
 *  4. yarn.ROOT: deploy + init in one transaction, then its only full-access key is deleted.
 *     Nobody can change $YARN's code or parameters after this.
 *  5. alley.ROOT: deploy + init.
 *  6. Merchant agents fill their tills from their own purses.
 *  7. The studio registers the keychain Beasts; their QR links go to scripts/.secrets/beasts.json.
 *  8. Demo players: demo1..demo4.ROOT, each with a woken Beast, plus demo5.ROOT (a buyer with no
 *     Beast, for trying adopt). Their keys are published in public/demo-accounts.json ON PURPOSE:
 *     testnet only, worthless NEAR, so anyone can press "Play a demo cat".
 * Server keys (ROOT, merchants, contracts) go to .env.local (gitignored).
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, type KeyPairString, actions, nearToYocto } from "near-api-js";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const ENV_FILE = resolve(ROOT_DIR, ".env.local");
const SECRETS_DIR = resolve(ROOT_DIR, "scripts/.secrets");
const WASM = (name: string) => resolve(ROOT_DIR, `contracts/target/near/${name}/${name}.wasm`);
const DEMO_FILE = resolve(ROOT_DIR, "public/demo-accounts.json");
const RPC = "https://test.rpc.fastnear.com";
const EXPLORER = "https://testnet.nearblocks.io";
const FAUCET = "https://helper.nearprotocol.com/account";
/** Testnet NEAR ROOT should hold before deploying. */
const TARGET_BALANCE = 34;
const NIGHT_MS = Number(process.env.NIGHT_MS ?? 10 * 60 * 1000);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TGAS = BigInt(1_000_000_000_000);

const provider = new JsonRpcProvider({ url: RPC });

// ------------------------------------------------------------------ env file

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

const env = readEnv();
function save(key: string, value: string) {
  env[key] = value;
  const body = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(ENV_FILE, `# Written by scripts/deploy.ts. Contains private keys: never commit.\n${body}\n`, { mode: 0o600 });
}

// ------------------------------------------------------------------ helpers

async function exists(accountId: string): Promise<boolean> {
  return provider
    .viewAccount({ accountId })
    .then(() => true)
    .catch(() => false);
}

async function codeHash(accountId: string): Promise<string | null> {
  const a = await provider.viewAccount({ accountId }).catch(() => null);
  return a?.code_hash && a.code_hash !== "11111111111111111111111111111111" ? a.code_hash : null;
}

function keyFor(name: string): KeyPairString {
  const envKey = `KEY_${name.toUpperCase()}`;
  if (!env[envKey]) save(envKey, KeyPair.fromRandom("ed25519").toString());
  return env[envKey] as KeyPairString;
}

async function faucet(accountId: string, key: KeyPairString) {
  const publicKey = KeyPair.fromString(key).getPublicKey().toString();
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  });
  if (!res.ok) throw new Error(`Faucet refused ${accountId}: ${res.status} ${await res.text()}`);
  for (let i = 0; i < 20 && !(await exists(accountId)); i++) await new Promise((r) => setTimeout(r, 1500));
  if (!(await exists(accountId))) throw new Error(`Faucet account ${accountId} never appeared`);
}

async function balanceNear(accountId: string): Promise<number> {
  const a = await provider.viewAccount({ accountId });
  return Number(BigInt(a.amount) / BigInt(10) ** BigInt(21)) / 1000;
}

function log(step: string, msg: string) {
  console.log(`${step.padEnd(8)} ${msg}`);
}

// ------------------------------------------------------------------ main

async function main() {
  // 1. ROOT
  let root = env.NEXT_PUBLIC_ROOT_ACCOUNT;
  if (!root) {
    root = process.env.ROOT_NAME ?? `bittybeasts-${randomBytes(3).toString("hex")}.testnet`;
    save("NEXT_PUBLIC_ROOT_ACCOUNT", root);
  }
  save("NEXT_PUBLIC_NETWORK", "testnet");
  save("NEXT_PUBLIC_RPC_URL", RPC);
  if (!env.AUTH_SECRET) save("AUTH_SECRET", randomBytes(32).toString("hex"));
  if (!env.NEAR_ROOT_KEY) save("NEAR_ROOT_KEY", KeyPair.fromRandom("ed25519").toString());
  const rootKey = env.NEAR_ROOT_KEY as KeyPairString;

  if (!(await exists(root))) {
    log("root", `creating ${root} via the testnet faucet`);
    await faucet(root, rootKey);
  }
  const rootAcc = new Account(root, provider, rootKey);
  let bal = await balanceNear(root);
  for (let i = 0; !env.TILLS_FILLED && bal < TARGET_BALANCE && i < 4; i++) {
    const donor = `bb-donor-${randomBytes(4).toString("hex")}.testnet`;
    const donorKey = KeyPair.fromRandom("ed25519").toString() as KeyPairString;
    log("root", `topping up from faucet donor ${donor}`);
    await faucet(donor, donorKey);
    await new Account(donor, provider, donorKey).deleteAccount(root);
    bal = await balanceNear(root);
  }
  log("root", `${root}: ${bal} NEAR`);

  // 2. sub-accounts
  // wallet: 55 KB global contract burns 10 NEAR / 100 KB. yarn, alley: ~1 NEAR / 100 KB staked.
  const subs: [string, string][] = [
    ["wallet", "6.2"],
    ["yarn", "2.6"],
    ["alley", "6"],
    ["studio", "3"],
    ["tom", "0.3"],
    ["miso", "0.3"],
    ["bandit", "0.3"],
    ["clove", "0.3"],
  ];
  const acct: Record<string, Account> = {};
  for (const [name, funds] of subs) {
    const id = `${name}.${root}`;
    const key = keyFor(name);
    if (!(await exists(id))) {
      log("account", `creating ${id} with ${funds} NEAR`);
      await rootAcc.signAndSendTransaction({
        receiverId: id,
        actions: [
          actions.createAccount(),
          actions.transfer(nearToYocto(funds as `${number}`)),
          actions.addFullAccessKey(KeyPair.fromString(key).getPublicKey()),
        ],
      });
    }
    acct[name] = new Account(id, provider, key);
  }
  for (const m of ["tom", "miso", "bandit", "clove"]) save(`MERCHANT_${m.toUpperCase()}_KEY`, keyFor(m));

  // 3. global beast-wallet
  const walletId = `wallet.${root}`;
  if (!env.WALLET_GLOBAL_DEPLOYED) {
    log("global", `publishing beast-wallet as a global contract under ${walletId}`);
    await acct.wallet.signAndSendTransaction({
      receiverId: walletId,
      actions: [actions.deployGlobalContract(readFileSync(WASM("beast_wallet")), "accountId")],
    });
    save("WALLET_GLOBAL_DEPLOYED", "1");
  }

  // 4. $YARN, then lock it
  const yarnId = `yarn.${root}`;
  const alleyId = `alley.${root}`;
  const merchants = ["tom", "miso", "bandit", "clove"].map((m) => `${m}.${root}`);
  if (!(await codeHash(yarnId))) {
    log("yarn", `deploying + init (night = ${NIGHT_MS / 60000} min)`);
    await acct.yarn.signAndSendTransaction({
      receiverId: yarnId,
      actions: [
        actions.deployContract(readFileSync(WASM("yarn"))),
        actions.functionCall("new", { alley: alleyId, night_ms: NIGHT_MS, merchants }, TGAS * BigInt(100), BigInt(0)),
      ],
    });
  }
  const yarnKeys = (await provider.viewAccessKeyList({ accountId: yarnId })) as { keys: unknown[] };
  if (yarnKeys.keys.length > 0) {
    log("yarn", "deleting the last full-access key: $YARN is now locked, no admin");
    await acct.yarn.deleteKey(KeyPair.fromString(keyFor("yarn")).getPublicKey());
  }

  // 5. alley
  if (!(await codeHash(alleyId))) {
    const names: Record<string, string> = { tom: "Old Tom", miso: "Miso", bandit: "Bandit", clove: "Sister Clove" };
    log("alley", "deploying + init");
    await acct.alley.signAndSendTransaction({
      receiverId: alleyId,
      actions: [
        actions.deployContract(readFileSync(WASM("alley"))),
        actions.functionCall(
          "new",
          {
            studio: `studio.${root}`,
            referee: root,
            yarn: yarnId,
            wallet_code: walletId,
            night_ms: String(NIGHT_MS),
            merchants: ["tom", "miso", "bandit", "clove"].map((m) => [
              `${m}.${root}`,
              names[m],
              KeyPair.fromString(keyFor(m)).getPublicKey().toString(),
            ]),
          },
          TGAS * BigInt(200),
          BigInt(0),
        ),
      ],
    });
  }

  // 6. merchant tills
  const floats: Record<string, number> = { tom: 60, miso: 200, bandit: 400, clove: 150 };
  if (!env.TILLS_FILLED) {
    for (const [m, amount] of Object.entries(floats)) {
      log("till", `${m} puts ${amount} YARN in the till`);
      await acct[m].callFunction({
        contractId: yarnId,
        methodName: "ft_transfer_call",
        args: { receiver_id: alleyId, amount: String(amount), msg: JSON.stringify({ till: {} }) },
        deposit: BigInt(1),
        gas: TGAS * BigInt(100),
      });
    }
    save("TILLS_FILLED", "1");
  }

  // 7. studio registers Beasts
  mkdirSync(SECRETS_DIR, { recursive: true });
  const secretsFile = resolve(SECRETS_DIR, "beasts.json");
  const secrets: Record<string, { name: string; secret: string; url: string }> = existsSync(secretsFile)
    ? JSON.parse(readFileSync(secretsFile, "utf8"))
    : {};
  const pieces = [
    // The photographed keychain: sparkle in the black glaze -> high Luck.
    { id: "alley-cat-001", name: "Inky", stats: { reach: 6, grip: 5, speed: 6, luck: 9 } },
    { id: "alley-cat-002", name: "Soot", stats: { reach: 8, grip: 4, speed: 5, luck: 5 } },
    { id: "alley-cat-003", name: "Pepper", stats: { reach: 4, grip: 8, speed: 7, luck: 4 } },
  ];
  type Piece = { id: string; name: string; stats: { reach: number; grip: number; speed: number; luck: number } };
  const beastExists = (id: string) =>
    provider.callFunction({ contractId: alleyId, method: "beast", args: { token_id: id } }).catch(() => null);
  async function register(p: Piece, secret: string) {
    log("beast", `studio registers ${p.name} (${p.id})`);
    await acct.studio.callFunction({
      contractId: alleyId,
      methodName: "register_beast",
      args: {
        token_id: p.id,
        name: p.name,
        media: "/art/cat-neutral.svg",
        stats: p.stats,
        claim_hash: createHash("sha256").update(secret).digest("hex"),
      },
      deposit: nearToYocto("0.3"),
      gas: TGAS * BigInt(150),
    });
  }
  for (const p of pieces) {
    if (await beastExists(p.id)) continue;
    const secret = secrets[p.id]?.secret ?? randomBytes(16).toString("hex");
    await register(p, secret);
    secrets[p.id] = { name: p.name, secret, url: `${APP_URL}/wake?t=${p.id}&s=${secret}` };
    writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }

  // 8. demo players (keys published on purpose: testnet only)
  type Demo = {
    accountId: string;
    secretKey: string;
    beast: { tokenId: string; name: string; controllerKey: string; keychainSecret: string } | null;
  };
  const demos: Demo[] = existsSync(DEMO_FILE) ? JSON.parse(readFileSync(DEMO_FILE, "utf8")).accounts : [];
  const demoPieces: (Piece | null)[] = [
    { id: "demo-cat-1", name: "Mochi", stats: { reach: 5, grip: 6, speed: 7, luck: 6 } },
    { id: "demo-cat-2", name: "Biscuit", stats: { reach: 7, grip: 5, speed: 5, luck: 7 } },
    { id: "demo-cat-3", name: "Noodle", stats: { reach: 6, grip: 7, speed: 6, luck: 5 } },
    { id: "demo-cat-4", name: "Pip", stats: { reach: 4, grip: 6, speed: 8, luck: 6 } },
    null, // demo5: a buyer with no Beast, for trying adopt
  ];
  for (let i = 0; i < demoPieces.length; i++) {
    const accountId = `demo${i + 1}.${root}`;
    let d = demos.find((x) => x.accountId === accountId);
    if (!d) {
      d = { accountId, secretKey: KeyPair.fromRandom("ed25519").toString(), beast: null };
      demos.push(d);
    }
    if (!(await exists(accountId))) {
      log("demo", `creating ${accountId}`);
      await rootAcc.signAndSendTransaction({
        receiverId: accountId,
        actions: [
          actions.createAccount(),
          actions.transfer(nearToYocto("1")),
          actions.addFullAccessKey(KeyPair.fromString(d.secretKey as KeyPairString).getPublicKey()),
        ],
      });
    }
    const p = demoPieces[i];
    if (p && !d.beast) {
      const keychainSecret = randomBytes(16).toString("hex");
      const controller = KeyPair.fromRandom("ed25519");
      if (!(await beastExists(p.id))) await register(p, keychainSecret);
      log("demo", `${accountId} wakes ${p.name}`);
      await new Account(accountId, provider, d.secretKey as KeyPairString).callFunction({
        contractId: alleyId,
        methodName: "wake",
        args: { token_id: p.id, secret: keychainSecret, controller_pk: controller.getPublicKey().toString() },
        gas: TGAS * BigInt(150),
      });
      d.beast = { tokenId: p.id, name: p.name, controllerKey: controller.toString(), keychainSecret };
    }
    writeFileSync(
      DEMO_FILE,
      JSON.stringify(
        {
          note: "TESTNET demo accounts. These private keys are public on purpose; the NEAR on them is free testnet NEAR.",
          network: "testnet",
          root,
          accounts: demos,
        },
        null,
        2,
      ),
    );
  }

  console.log("\nDone.");
  console.log(`  alley   ${EXPLORER}/address/${alleyId}`);
  console.log(`  yarn    ${EXPLORER}/address/${yarnId}`);
  console.log(`  wallet  ${EXPLORER}/address/${walletId}`);
  console.log(`  ROOT balance: ${await balanceNear(root)} NEAR`);
  console.log(`\nKeychain QR links (print these): ${secretsFile.replace(ROOT_DIR + "/", "")}`);
  console.log(`Demo players (public keys on purpose): public/demo-accounts.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
