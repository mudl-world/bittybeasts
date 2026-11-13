"use client";
// Browser key storage. The player never sees a seed phrase: keys are generated here
// and kept in localStorage for this device.
import { KeyPair, type KeyPairString } from "near-api-js";

const PLAYER = "bb:player";
const beastKeyName = (tokenId: string) => `bb:beastkey:${tokenId}`;

export type PlayerSession = { accountId: string; email?: string; secretKey: KeyPairString };

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: session lasts for this tab only */
  }
}

export function newKeyPair(): { secretKey: KeyPairString; publicKey: string } {
  const kp = KeyPair.fromRandom("ed25519");
  return { secretKey: kp.toString() as KeyPairString, publicKey: kp.getPublicKey().toString() };
}

export const keys = {
  player: () => read<PlayerSession>(PLAYER),
  setPlayer: (s: PlayerSession) => write(PLAYER, s),
  clearPlayer: () => {
    try {
      window.localStorage.removeItem(PLAYER);
    } catch {
      /* ignore */
    }
  },
  beast: (tokenId: string) => read<KeyPairString>(beastKeyName(tokenId)),
  setBeast: (tokenId: string, secret: KeyPairString) => write(beastKeyName(tokenId), secret),
  /** A free kitten's claim secret (stands in for the keychain tag: needed to boop it or hand it on). */
  kittenSecret: (tokenId: string) => read<string>(`bb:kitten:${tokenId}`),
  setKittenSecret: (tokenId: string, secret: string) => write(`bb:kitten:${tokenId}`, secret),
};
