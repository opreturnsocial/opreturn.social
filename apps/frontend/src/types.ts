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

export interface ActivityItem {
  type: "follow" | "unfollow" | "profile_update";
  txid: string;
  pubkey: string;
  timestamp: number;
  blockHeight: number;
  status: string;
  targetPubkey?: string;
  propertyKind?: number;
  value?: string;
  replyCount: number;
  repostCount: number;
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
