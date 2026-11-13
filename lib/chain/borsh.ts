// Minimal Borsh encoder for the beast-wallet's `execute(calls: Vec<Call>)`.
// The wallet contract takes Borsh (not JSON) to keep its global-contract code small.
export type WalletCall = { receiver_id: string; method_name: string; args: string; deposit: bigint; gas: bigint };

const enc = new TextEncoder();

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function uint(n: bigint, bytes: number): number[] {
  const out: number[] = [];
  let v = n;
  for (let i = 0; i < bytes; i++) {
    out.push(Number(v & BigInt(0xff)));
    v >>= BigInt(8);
  }
  return out;
}

function str(s: string): number[] {
  const b = enc.encode(s);
  return [...u32(b.length), ...b];
}

export function encodeCalls(calls: WalletCall[]): Uint8Array {
  const out: number[] = [...u32(calls.length)];
  for (const c of calls) {
    out.push(...str(c.receiver_id), ...str(c.method_name), ...str(c.args), ...uint(c.deposit, 16), ...uint(c.gas, 8));
  }
  return new Uint8Array(out);
}
