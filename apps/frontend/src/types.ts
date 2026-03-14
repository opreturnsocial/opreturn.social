export interface Post {
  txid: string;
  blockHeight: number;
  timestamp: number;
  content: string;
  kind: number;
  pubkey: string;
  sig: string;
  parentTxid?: string | null;
  status: string;
}

export interface Profile {
  pubkey: string;
  name?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  status?: string;
}

// Alby Extension Nostr API (window.nostr)
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signSchnorr(msgHex: string): Promise<string>;
    };
  }
}
