// Network and account ids. Everything derives from NEXT_PUBLIC_ROOT_ACCOUNT.
// NEAR testnet only.
const root = process.env.NEXT_PUBLIC_ROOT_ACCOUNT ?? "bittybeasts.testnet";
const network = "testnet" as const;

export const CONFIG = {
  network,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://test.rpc.fastnear.com",
  explorer: "https://testnet.nearblocks.io",
  root,
  alley: `alley.${root}`,
  yarn: `yarn.${root}`,
  studio: `studio.${root}`,
  merchants: {
    tom: `tom.${root}`,
    miso: `miso.${root}`,
    bandit: `bandit.${root}`,
    clove: `clove.${root}`,
  },
  beastAccount: (tokenId: string) => `${tokenId}.alley.${root}`,
} as const;

export type MerchantKey = keyof typeof CONFIG.merchants;
