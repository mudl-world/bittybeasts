"use client";
// Every transaction behind the game, read from NearBlocks' indexer: the alley and $YARN contracts,
// the game server, the merchant agents, your account and your cat's own account.
import { useCallback, useEffect, useState } from "react";
import { CONFIG, getBeastsForOwner } from "@/lib/chain";
import type { ArtSlot } from "@/lib/ui/art";
import { shortAccount } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "./Art";
import { Loading, Notice, Pill, Spinner } from "./ui";

type Tx = {
  hash: string;
  at_ms: number;
  signer: string;
  receiver: string;
  actions: { action: string; method: string | null }[];
  deposit: string;
  fee: string;
  ok: boolean | null;
};

/** Plain words for each contract method, and an icon. */
const METHODS: Record<string, [string, ArtSlot]> = {
  settle_run: ["Prowl settled", "ui-missions"],
  close_night: ["Market night closed", "st-clock"],
  settle: ["Night settled up (YARN created or destroyed)", "st-mint"],
  tug: ["Checked in for the night", "item-yarn"],
  register_beast: ["New cat made", "cat-happy"],
  wake: ["Cat woke up", "cat-surprised"],
  bind_key: ["Device bound to a cat", "ui-cuddle"],
  boop: ["Daily cuddle", "ui-cuddle"],
  wander: ["Cat let wander (resale)", "ui-signout"],
  cancel_wander: ["Cat called home", "ui-home"],
  adopt: ["Cat adopted (royalty paid)", "ui-cuddle"],
  execute: ["Cat acted from its own account", "cat-curious"],
  ft_transfer: ["YARN sent", "item-yarn"],
  ft_transfer_call: ["YARN paid", "item-yarn"],
  mt_transfer: ["Items handed over", "item-fish"],
  record_thought: ["Verified thought recorded (NEAR AI)", "ui-verified"],
  sell_to_merchant: ["Sold to a merchant", "st-sell"],
  feed: ["Cat fed", "ui-feed"],
  dress: ["Cat dressed", "ui-wardrobe"],
  set_persona: ["Personality written", "ui-persona"],
  stock_wardrobe: ["Miso stocked her wardrobe", "item-hat"],
  new: ["Contract set up", "st-legend"],
};

function describe(t: Tx): [string, ArtSlot] {
  const fn = t.actions.find((a) => a.method)?.method;
  if (fn) return METHODS[fn] ?? [fn.replace(/_/g, " "), "st-receipt"];
  const kinds = t.actions.map((a) => a.action);
  if (kinds.includes("CREATE_ACCOUNT")) return ["Account created", "ui-home"];
  if (kinds.includes("DEPLOY_CONTRACT") || kinds.includes("USE_GLOBAL_CONTRACT")) return ["Contract deployed", "st-legend"];
  if (kinds.includes("TRANSFER")) return ["NEAR sent", "st-buy"];
  if (kinds.includes("ADD_KEY") || kinds.includes("DELETE_KEY")) return ["Access key changed", "ui-signout"];
  return [kinds.join(", ").toLowerCase(), "st-receipt"];
}

/** Game accounts by their short names (alley, yarn, tom, Mochi's account...), anything else shortened. */
function who(a: string): string {
  if (a === CONFIG.root) return "game server";
  if (a.endsWith(`.${CONFIG.root}`)) return a.slice(0, -CONFIG.root.length - 1);
  return shortAccount(a);
}

const near = (yocto: string) => {
  const n = Number(BigInt(yocto) / BigInt(10) ** BigInt(18)) / 1e6;
  return n >= 0.0001 ? `${n.toFixed(4)} NEAR` : "";
};

function ago(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function Activity() {
  const { session } = useSession();
  const mine = useAsync(session ? () => getBeastsForOwner(session.accountId) : null, [session?.accountId]);
  const cat = mine.data?.[0];

  const scopes: { key: string; label: string; icon: ArtSlot; account: string }[] = [
    { key: "alley", label: "The alley contract", icon: "ui-lane", account: CONFIG.alley },
    { key: "yarn", label: "$YARN", icon: "item-yarn", account: CONFIG.yarn },
    { key: "server", label: "Game server (referee, keeper)", icon: "st-clock", account: CONFIG.root },
    { key: "tom", label: "Old Tom", icon: "merchant-tom", account: CONFIG.merchants.tom },
    { key: "miso", label: "Miso", icon: "merchant-miso", account: CONFIG.merchants.miso },
    { key: "bandit", label: "Bandit", icon: "merchant-bandit", account: CONFIG.merchants.bandit },
    { key: "clove", label: "Sister Clove", icon: "merchant-clove", account: CONFIG.merchants.clove },
    ...(cat ? [{ key: "cat", label: `${cat.name}'s own account`, icon: "cat-happy" as ArtSlot, account: cat.account_id }] : []),
    ...(session ? [{ key: "me", label: "Your account", icon: "ui-home" as ArtSlot, account: session.accountId }] : []),
  ];
  const [scope, setScope] = useState("alley");
  const current = scopes.find((s) => s.key === scope) ?? scopes[0];

  const [txs, setTxs] = useState<Tx[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "more" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (account: string, cursor: string | null) => {
    setState(cursor ? "more" : "loading");
    setError(null);
    try {
      const q = new URLSearchParams({ account, limit: "25" });
      if (cursor) q.set("next", cursor);
      const res = await fetch(`/api/txs?${q}`);
      const body = (await res.json()) as { txs?: Tx[]; next?: string | null; error?: string };
      if (!res.ok || !body.txs) throw new Error(body.error ?? "Couldn't load transactions");
      setTxs((prev) => (cursor ? [...prev, ...body.txs!] : body.txs!));
      setNext(body.next ?? null);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching is the external system here
    void load(current.account, null);
  }, [current.account, load]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="title-3d text-sm">On chain</p>
        <h1 className="text-4xl">Every move, on NEAR</h1>
        <p className="max-w-2xl text-mist">
          Every prowl, trade, cuddle, mint and burn is a real transaction on NEAR {CONFIG.network}. Pick an account to see its history, straight from the
          NearBlocks indexer, and open any transaction on the explorer.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Accounts">
        {scopes.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`btn btn-sm gap-1.5 ${s.key === current.key ? "btn-lantern" : "btn-ghost"}`}
            aria-pressed={s.key === current.key}
            title={s.account}
          >
            <Art slot={s.icon} alt="" size={22} /> {s.label}
          </button>
        ))}
      </nav>

      <section className="card flex flex-col gap-3 p-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-3d text-lg">{current.label}</h2>
          <a href={`${CONFIG.explorer}/address/${current.account}`} target="_blank" rel="noreferrer" className="font-display text-sm text-mist underline decoration-dotted underline-offset-4 hover:text-paper">
            {current.account} ↗
          </a>
        </div>

        {state === "loading" ? (
          <Loading label="Reading the chain…" />
        ) : state === "error" && !txs.length ? (
          <Notice kind="err">{error}</Notice>
        ) : !txs.length ? (
          <p className="py-6 text-center text-mist">No transactions yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-white/10">
            {txs.map((t) => {
              const [label, icon] = describe(t);
              const method = t.actions.find((a) => a.method)?.method;
              return (
                <li key={t.hash} className="flex items-center gap-3 py-2.5">
                  <Art slot={icon} alt="" size={34} className="shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display">{label}</span>
                      {method && <code className="rounded bg-white/5 px-1.5 text-xs text-mist">{method}</code>}
                      {t.ok === false && <Pill tone="ember">failed</Pill>}
                    </div>
                    <span className="truncate text-xs text-mist" title={`${t.signer} → ${t.receiver}`}>
                      {who(t.signer)} → {who(t.receiver)}
                      {near(t.deposit) && ` · ${near(t.deposit)}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <a
                      href={`${CONFIG.explorer}/txns/${t.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-[#ffc93c] underline decoration-dotted underline-offset-4"
                      title={t.hash}
                    >
                      {t.hash.slice(0, 8)}… ↗
                    </a>
                    <span className="text-xs text-mist">{ago(t.at_ms)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {next && state !== "loading" && (
          <button className="btn btn-ghost btn-sm self-center" onClick={() => void load(current.account, next)} disabled={state === "more"}>
            {state === "more" ? <Spinner /> : null} Older
          </button>
        )}
        {state === "error" && txs.length > 0 && <Notice kind="err">{error}</Notice>}
      </section>
    </div>
  );
}
