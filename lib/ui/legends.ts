// Hall of Legends: every Beast that has lost and won back nine lives.
import { getBeasts, type Beast } from "@/lib/chain";

export async function getLegends(): Promise<Beast[]> {
  const all = await getBeasts(0, 100);
  return all.filter((b) => b.legend);
}
