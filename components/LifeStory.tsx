"use client";
// A Beast's public life story. This page may talk about the chain: it is the Beast's provenance.
import { CONFIG, getBeast, getHistory, type Beast, type HistoryEntry } from "@/lib/chain";
import { markSlot, type ArtSlot } from "@/lib/ui/art";
import { QUIET } from "@/lib/ui/errors";
import { formatDate, num, shortAccount, yarn } from "@/lib/ui/format";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "./Art";
import BeastCard from "./BeastCard";
import { DiaryList, useDiaryTxs } from "./alley/Diary";
import { Empty, ExplorerLink, Loading, Pill } from "./ui";

const addr = (a: string) => `${CONFIG.explorer}/address/${a}`;

type Owner = { account: string; from: number };

function owners(beast: Beast, history: HistoryEntry[]): Owner[] {
  const sorted = [...history].sort((a, b) => a.at_ms - b.at_ms);
  const out: Owner[] = [];
  for (const e of sorted) {
    if (!e.owner) continue;
    if (out[out.length - 1]?.account !== e.owner) out.push({ account: e.owner, from: e.at_ms });
  }
  if (beast.owner_id && out[out.length - 1]?.account !== beast.owner_id) out.push({ account: beast.owner_id, from: 0 });
  return out;
}

const isLifeLost = (e: HistoryEntry) => /fall|fell|life_lost|lost a life|link went dark/i.test(`${e.kind} ${e.text}`);
const isPayout = (e: HistoryEntry) => !!e.yarn && num(e.yarn) !== 0;

export default function LifeStory({ tokenId }: { tokenId: string }) {
  const beast = useAsync(() => getBeast(tokenId), [tokenId]);
  const history = useAsync(() => getHistory(tokenId, 0, 500), [tokenId]);
  const txs = useDiaryTxs(tokenId);

  if (beast.loading && !beast.data) return <Loading label="Turning the pages…" />;
  if (beast.error && !beast.data)
    return (
      <Empty title="This story is out of reach" action={<button className="btn btn-ghost btn-sm" onClick={beast.reload}>Try again</button>}>
        We couldn&apos;t read Beast #{tokenId} from the NEAR alley contract right now. The contract may not be deployed yet, or the RPC is busy.
      </Empty>
    );
  const b = beast.data;
  if (!b) return <Empty title={`No Beast #${tokenId}`}>No Bitty Beast with that number has been registered.</Empty>;

  const h = history.data ?? [];
  const lost = h.filter(isLifeLost);
  const pay = h.filter(isPayout);
  const earned = pay.reduce((a, e) => a + Math.max(0, num(e.yarn)), 0);
  const spent = pay.reduce((a, e) => a + Math.min(0, num(e.yarn)), 0);
  const ownerList = owners(b, h);

  return (
    // Bento: everything about the cat on the left, its diary running down the right.
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,32%)]">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* the cat, and where it lives on NEAR */}
        <section className="card col-span-2 flex flex-col gap-4 p-1 md:col-span-4">
          <BeastCard beast={b} size={170}>
            <div className="flex flex-wrap gap-2">
              {!b.woken && <Pill>still asleep</Pill>}
              <Pill tone="lantern">Beast #{b.token_id}</Pill>
            </div>
          </BeastCard>
          <div className="flex flex-col gap-1.5 border-t-2 border-dashed border-white/10 pt-3 text-sm">
            <h3 className="title-3d text-sm">Where it lives</h3>
            <p className="text-mist">
              A NEAR token (NEP-171) with its own account that holds its $YARN and items. Only the alley contract and its owner&apos;s device key can move
              them.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <ExplorerLink href={addr(b.account_id)}>Its account {shortAccount(b.account_id)}</ExplorerLink>
              <ExplorerLink href={addr(b.owner_id)}>Owner {shortAccount(b.owner_id)}</ExplorerLink>
              <ExplorerLink href={addr(CONFIG.alley)}>Alley contract</ExplorerLink>
              <ExplorerLink href={addr(CONFIG.studio)}>Maker</ExplorerLink>
            </div>
          </div>
        </section>

        <Stat icon="st-clock" label="Born" value={formatDate(b.born_ms)} sub={`made by ${shortAccount(b.maker)}`} />
        <Stat icon="ui-link-dark" label="Lives lost" value={String(b.lives_lost_total)} sub={`${b.lives_won_total} won back`} />
        <Stat icon="ui-missions" label="Best daring run" value={`${b.best_run} roofs`} />
        <Stat icon="item-yarn" label="Earned" value={`${yarn(earned)} YARN`} sub={spent ? `${yarn(-spent)} spent` : undefined} />

        <section className="card col-span-2 p-1">
          <h3 className="title-3d mb-3 text-sm">Every home it&apos;s had</h3>
          <ol className="flex flex-col gap-2">
            {ownerList.map((o, i) => (
              <li key={`${o.account}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-5 text-center text-lantern">{i + 1}</span>
                <span className="font-mono text-xs text-paper">{shortAccount(o.account)}</span>
                {o.from ? <span className="text-xs text-mist">from {formatDate(o.from)}</span> : null}
                {o.account === b.owner_id && <Pill tone="moss">now</Pill>}
                <ExplorerLink href={addr(o.account)}>on NEAR</ExplorerLink>
              </li>
            ))}
            {!ownerList.length && <li className="text-sm text-mist">Waiting for its first home.</li>}
          </ol>
        </section>

        <section className="card col-span-2 p-1">
          <h3 className="title-3d mb-3 text-sm">Lives lost, and how</h3>
          {lost.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {lost.map((e, i) => (
                <li key={`${e.at_ms}-${i}`} className="flex gap-2">
                  <Art slot="ui-link-dark" alt="" size={18} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{e.text}</span>
                  <span className="shrink-0 text-xs text-mist">{formatDate(e.at_ms)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mist">Not a scratch. Yet.</p>
          )}
          {b.marks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {b.marks.map((m, i) => (
                <div key={`${m.at_ms}-${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5 pr-3 text-xs" title={`${m.note} · ${formatDate(m.at_ms)}`}>
                  <Art slot={markSlot(m.kind)} size={32} alt={m.kind} />
                  <span className="font-display capitalize text-paper">{m.kind.replace("-", " ")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* the diary, down the right */}
      <section className="card flex max-h-[calc(100dvh-7rem)] flex-col p-1 lg:sticky lg:top-20">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="title-3d text-lg">Diary</h3>
          <span className="text-xs text-mist">recorded on NEAR · tap a tx to verify</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {history.error && !history.data ? <p className="text-sm text-mist">{QUIET}</p> : history.loading && !history.data ? <Loading /> : <DiaryList entries={h} txs={txs} />}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: ArtSlot; label: string; value: string; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-0">
      <div className="flex items-center gap-2">
        <Art slot={icon} alt="" size={28} />
        <p className="text-xs uppercase tracking-wider text-mist">{label}</p>
      </div>
      <p className="font-display text-xl text-paper">{value}</p>
      {sub && <p className="text-xs text-mist">{sub}</p>}
    </div>
  );
}
