// Small display helpers. Pure functions, safe on server and client.

const YOCTO = BigInt("1000000000000000000000000");

export function yoctoToNear(yocto: string, digits = 3): string {
  try {
    const v = BigInt(yocto);
    const whole = v / YOCTO;
    const frac = (v % YOCTO).toString().padStart(24, "0").slice(0, digits).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return yocto;
  }
}

export function num(v: string | number | undefined | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function yarn(v: string | number | undefined | null): string {
  return num(v).toLocaleString("en-US");
}

export function formatDate(ms: number): string {
  if (!ms) return "unknown";
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Short, readable account names: the game's own accounts lose the shared root suffix
 *  ("studio", "demo-cat-1.alley", "game server"); anything else keeps its ends. */
export function shortAccount(a: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_ACCOUNT;
  if (root) {
    if (a === root) return "game server";
    if (a.endsWith(`.${root}`)) return a.slice(0, -root.length - 1);
  }
  if (a.length <= 22) return a;
  return `${a.slice(0, 10)}…${a.slice(-8)}`;
}

export function duration(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export const ITEM_LABEL: Record<string, string> = {
  fish: "Fish",
  button: "Button",
  bell: "Bell",
  moonstone: "Moonstone",
  charm: "Charm",
  catnip: "Catnip",
  lantern: "Lantern",
  hat: "Knitted hat",
  scarf: "Scarf",
  bow: "Bow",
  glasses: "Round glasses",
};

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
